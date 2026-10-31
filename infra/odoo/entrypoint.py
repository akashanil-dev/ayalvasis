"""Render private configuration and bootstrap before any HTTP listener starts."""
import configparser
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import psycopg2


def secret(name):
    value = (Path('/run/secrets') / name).read_text().strip()
    if len(value) < 32 or '\n' in value or '\r' in value:
        raise ValueError(f'Invalid secret: {name}')
    return value


def configuration():
    db_name = os.environ['DB_NAME']
    db_user = os.environ['DB_USER']
    for value in (db_name, db_user):
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', value):
            raise ValueError('Database identifiers must be simple lowercase identifiers')
    workers = int(os.environ.get('ODOO_WORKERS', '0'))
    if not 0 <= workers <= 16:
        raise ValueError('ODOO_WORKERS must be between 0 and 16')
    config = configparser.ConfigParser(interpolation=None)
    config['options'] = {
        'data_dir': '/var/lib/odoo',
        'db_host': os.environ.get('DB_HOST', 'db'),
        'db_port': '5432',
        'db_user': db_user,
        'db_password': secret('db_password'),
        'db_name': db_name,
        'dbfilter': f'^{db_name}$',
        'list_db': 'False',
        'admin_passwd': secret('master_password'),
        'proxy_mode': os.environ.get('ODOO_PROXY_MODE', 'False'),
        'workers': str(workers),
        'max_cron_threads': '1',
        'db_maxconn': '16',
        'limit_memory_soft': '536870912',
        'limit_memory_hard': '805306368',
        'limit_time_cpu': '60',
        'limit_time_real': '120',
        'log_level': 'info',
        # Access URLs may contain password-reset / portal tokens.
        'log_handler': ':INFO,werkzeug:WARNING',
    }
    if any(Path('/mnt/extra-addons').glob('*/__manifest__.py')):
        config['options']['addons_path'] = '/mnt/extra-addons'
    path = Path('/tmp/ayalvasis-odoo.conf')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        config.write(stream)
    return str(path), config['options']


def connect(options):
    for _ in range(60):
        try:
            return psycopg2.connect(
                host=options['db_host'], dbname=options['db_name'],
                user=options['db_user'], password=options['db_password'],
                connect_timeout=3,
            )
        except psycopg2.OperationalError:
            time.sleep(1)
    raise RuntimeError('Database unavailable after 60 attempts; check credentials and service health')


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'serve'
    if mode not in ('serve', 'initialize', 'shell', 'install', 'upgrade', 'test'):
        raise ValueError('Expected serve, initialize, shell, install, upgrade or test')
    path, options = configuration()
    # Odoo reads ODOO_RC during early import, before parsing the -c argument.
    os.environ['ODOO_RC'] = path
    with connect(options) as conn, conn.cursor() as cursor:
        cursor.execute("SELECT to_regclass('public.ir_module_module')")
        initialized = cursor.fetchone()[0] is not None
        if mode == 'initialize' and initialized:
            raise RuntimeError('Database already has Odoo tables; refusing to initialize or reset credentials')
        if mode == 'serve':
            if not initialized:
                raise RuntimeError('Database not initialized; run scripts/stack.py init first')
            cursor.execute("SELECT value FROM ir_config_parameter WHERE key = 'ayalvasis.infra_initialized'")
            if cursor.fetchone() != ('true',):
                raise RuntimeError('Secure bootstrap incomplete; refusing to expose HTTP')
    if mode == 'initialize':
        subprocess.run([
            'odoo', '-c', path, '--workers=0', '--max-cron-threads=0',
            '--init=base,web,auth_signup,portal,sale_management,account',
            '--without-demo=True', '--stop-after-init', '--no-http',
            '--limit-time-real=1200', '--limit-time-cpu=1200',
        ], check=True)
        script = """
import os
from pathlib import Path
password = Path('/run/secrets/admin_password').read_text().strip()
if len(password) < 32:
    raise ValueError('Admin password too short')
admin = env.ref('base.user_admin')
admin.write({'login': os.environ['ADMIN_LOGIN'], 'email': os.environ['ADMIN_LOGIN'], 'password': password})
env['ir.config_parameter'].sudo().set_param('auth_signup.invitation_scope', 'b2b')
env['ir.config_parameter'].sudo().set_param('ayalvasis.infra_initialized', 'true')
env.cr.commit()
"""
        subprocess.run(['odoo', 'shell', '-c', path, '--no-http'], input=script, text=True, check=True)
        print('Secure bootstrap complete. Administrator password is in the local secret file.')
        return
    if mode in ('install', 'upgrade', 'test'):
        if not initialized:
            raise RuntimeError('Initialize the database before installing application modules')
        args = ['odoo', '-c', path, '--workers=0', '--max-cron-threads=0',
                '--stop-after-init', '--no-http', '--without-demo=True',
                '--limit-time-real=1200', '--limit-time-cpu=1200',
                ('--init=' if mode == 'install' else '--update=') + 'ayal_subscription']
        if mode == 'test':
            args += ['--test-enable', '--test-tags=/ayal_subscription']
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        print(result.stdout, end='')
        summary = re.search(r'(\d+) failed, (\d+) error\(s\) of (\d+) tests', result.stdout)
        failed_tests = mode == 'test' and (not summary or int(summary[1]) or int(summary[2]) or not int(summary[3]))
        if result.returncode or failed_tests:
            raise RuntimeError('Application installation or test execution failed; inspect the log')
        return
    args = ['odoo', '-c', path] if mode == 'serve' else ['odoo', 'shell', '-c', path, '--no-http']
    os.execvp(args[0], args)


if __name__ == '__main__':
    main()
