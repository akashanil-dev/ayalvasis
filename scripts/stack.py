#!/usr/bin/env python3
"""Project-scoped infrastructure CLI. No third-party Python dependencies."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def read_env(path):
    values = {}
    for line in path.read_text().splitlines():
        if not line or line.lstrip().startswith('#'):
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip()
    return values


def setup(env_file, mode):
    if env_file.exists():
        raise RuntimeError(f'{env_file.name} already exists; refusing to overwrite')
    values = read_env(ROOT / '.env.example')
    values.update(COMPOSE_PROJECT_NAME=f'ayalvasis-{mode}', APP_IMAGE=f'ayalvasis-odoo:{mode}',
                  SECRET_DIR=f'./.secrets/{mode}', ODOO_WORKERS='2' if mode == 'prod' else '0',
                  ODOO_PROXY_MODE='True' if mode == 'prod' else 'False')
    folder = ROOT / values['SECRET_DIR']
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    (ROOT / '.secrets').chmod(0o700)
    folder.chmod(0o700)
    for name in ('postgres_password', 'db_password', 'master_password', 'admin_password'):
        path = folder / name
        if not path.exists():
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
            with os.fdopen(fd, 'w') as stream:
                stream.write(secrets.token_urlsafe(48) + '\n')
        # Compose file secrets preserve host mode. Parent 0700 protects host access;
        # mounted files must be readable by the image's non-root Odoo user.
        path.chmod(0o444)
    fd = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(''.join(f'{key}={value}\n' for key, value in values.items()))
    print(f'Created {env_file.name}; secrets saved under {values["SECRET_DIR"]} (values not printed).')


class Stack:
    def __init__(self, env_file, mode):
        self.values = read_env(env_file)
        self.mode = mode
        self.base = ['docker', 'compose', '--env-file', str(env_file), '-f', str(ROOT / 'compose.yaml'),
                     '-f', str(ROOT / f'compose.{mode}.yaml')]
        # Do not let unrelated exported shell variables override this deployment.
        self.environ = os.environ.copy()
        for key in self.values:
            self.environ.pop(key, None)

    def run(self, *args, **kwargs):
        return subprocess.run(self.base + list(args), cwd=ROOT, env=self.environ, check=True, **kwargs)

    def output(self, *args):
        return self.run(*args, capture_output=True, text=True).stdout.strip()

    def validate(self, production=False):
        for key in ('DB_NAME', 'DB_USER'):
            if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', self.values.get(key, '')):
                raise ValueError(f'Invalid {key}')
        if self.values['DB_USER'] == 'postgres':
            raise ValueError('The application must not use the postgres superuser')
        if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', self.values['COMPOSE_PROJECT_NAME']):
            raise ValueError('Invalid project name')
        for name in ('postgres_password', 'db_password', 'master_password', 'admin_password'):
            if len((ROOT / self.values['SECRET_DIR'] / name).read_text().strip()) < 32:
                raise ValueError(f'Missing or short {name}')
        if production:
            domain = self.values.get('DOMAIN', '')
            if not re.fullmatch(r'(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?', domain) or '.' not in domain or domain.endswith(('.test', '.example', '.invalid')):
                raise ValueError('Set DOMAIN to the real public DNS name before production startup')
            for key in ('ADMIN_LOGIN', 'ACME_EMAIL'):
                if '@' not in self.values[key] or self.values[key].endswith(('.test', '.example', '.invalid')):
                    raise ValueError(f'Set a real {key} before production startup')
            if self.values['ODOO_PROXY_MODE'] != 'True' or int(self.values['ODOO_WORKERS']) < 1:
                raise ValueError('Production requires proxy mode and at least one worker')
            for key in ('ODOO_IMAGE', 'POSTGRES_IMAGE', 'CADDY_IMAGE'):
                if not re.search(r'@sha256:[a-f0-9]{64}$', self.values[key]):
                    raise ValueError(f'Pin {key} by digest before production startup')
            if self.values['APP_IMAGE'].endswith((':dev', ':prod', ':latest')):
                raise ValueError('Set APP_IMAGE to a unique release tag before production startup')
        self.run('config', '--quiet')

    def sql(self, query):
        return self.run('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', self.values['DB_NAME'],
                        '-At', '-v', 'ON_ERROR_STOP=1', input=query, capture_output=True, text=True).stdout.strip()

    def database_up(self):
        self.run('up', '-d', '--wait', '--wait-timeout', '120', 'db')

    def backup(self):
        self.database_up()
        folder = ROOT / 'backups' / self.values['COMPOSE_PROJECT_NAME'] / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
        folder.mkdir(parents=True, mode=0o700)
        running = [x for x in self.output('ps', '--status', 'running', '--services').splitlines() if x in ('odoo', 'proxy')]
        try:
            if running:
                self.run('stop', '--timeout', '90', *running)
            with (folder / 'database.dump').open('wb') as stream:
                self.run('exec', '-T', 'db', 'pg_dump', '-U', 'postgres', '-d', self.values['DB_NAME'],
                         '--format=custom', '--no-owner', '--no-acl', stdout=stream)
            with (folder / 'filestore.tar.gz').open('wb') as stream:
                self.run('run', '--rm', '--no-deps', '-T', 'storage', 'export', stdout=stream)
            manifest = {'version': 1, 'database': self.values['DB_NAME'], 'project': self.values['COMPOSE_PROJECT_NAME'],
                        'images': {key: self.values[key] for key in ('APP_IMAGE', 'ODOO_IMAGE', 'POSTGRES_IMAGE')},
                        'sha256': {name: digest(folder / name) for name in ('database.dump', 'filestore.tar.gz')}}
            (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
            (folder / 'COMPLETE').touch()
        finally:
            if running:
                self.run('start', *running)
        print(f'Backup complete: {folder}')

    def restore(self, folder):
        if not (folder / 'COMPLETE').exists():
            raise ValueError('Backup is incomplete')
        manifest = json.loads((folder / 'manifest.json').read_text())
        if manifest['version'] != 1 or manifest['database'] != self.values['DB_NAME']:
            raise ValueError('Backup format/database mismatch; restore requires the original database name')
        for key in ('ODOO_IMAGE', 'POSTGRES_IMAGE'):
            if manifest['images'][key] != self.values[key]:
                raise ValueError(f'{key} differs from backup; restore with the original runtime first')
        if manifest['images']['APP_IMAGE'] != self.values['APP_IMAGE']:
            raise ValueError('APP_IMAGE differs from backup; use the matching release')
        for name in ('database.dump', 'filestore.tar.gz'):
            if digest(folder / name) != manifest['sha256'][name]:
                raise ValueError(f'Checksum failed: {name}')
        if any(x in ('odoo', 'proxy') for x in self.output('ps', '--status', 'running', '--services').splitlines()):
            raise ValueError('Stop the target application before restore')
        self.database_up()
        if self.sql("SELECT count(*) FROM pg_tables WHERE schemaname = 'public';") != '0':
            raise ValueError('Restore requires an empty database; existing data will not be overwritten')
        with (folder / 'filestore.tar.gz').open('rb') as stream:
            self.run('run', '--rm', '--no-deps', '-T', 'storage', 'import', stdin=stream)
        with (folder / 'database.dump').open('rb') as stream:
            self.run('exec', '-T', 'db', 'pg_restore', '-U', 'postgres', '-d', self.values['DB_NAME'],
                     '--role', self.values['DB_USER'], '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', stdin=stream)
        print('Restored. Web and cron remain stopped. Review outgoing mail/payment integrations before startup.')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


@contextmanager
def operation_lock(project):
    directory = ROOT / '.state'
    directory.mkdir(exist_ok=True, mode=0o700)
    with (directory / f'{project}.lock').open('w') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('dev', 'prod'), default='dev')
    parser.add_argument('--env-file', type=Path)
    parser.add_argument('command', choices=('setup', 'validate', 'preflight', 'build', 'init', 'up', 'down', 'status', 'logs', 'check', 'backup', 'restore'))
    parser.add_argument('backup_path', nargs='?', type=Path)
    args = parser.parse_args()
    env_file = args.env_file or ROOT / ('.env.production' if args.mode == 'prod' else '.env')
    env_file = env_file.resolve()
    os.umask(0o077)
    if args.command == 'setup':
        setup(env_file, args.mode)
        return
    stack = Stack(env_file, args.mode)
    stack.validate(production=args.command == 'preflight' or (args.mode == 'prod' and args.command in ('up', 'init')))
    if args.command in ('validate', 'preflight'):
        print(f'{args.mode} configuration valid')
        return
    with operation_lock(stack.values['COMPOSE_PROJECT_NAME']):
        if args.command == 'build':
            stack.run('build', '--pull', 'odoo')
        elif args.command == 'init':
            stack.database_up()
            stack.run('run', '--rm', '--no-deps', '-T', 'bootstrap')
        elif args.command == 'up':
            services = ['odoo', 'proxy'] if args.mode == 'prod' else ['odoo']
            stack.run('up', '-d', '--wait', '--wait-timeout', '240', *services)
        elif args.command == 'down':
            stack.run('down')  # Named volumes are deliberately retained.
        elif args.command == 'status':
            stack.run('ps', '--all')
        elif args.command == 'logs':
            stack.run('logs', '--tail', '100')
        elif args.command == 'check':
            stack.run('exec', '-T', 'odoo', 'python3', '/opt/infra/healthcheck.py')
            if stack.sql(f"SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = '{stack.values['DB_USER']}';") != 'f':
                raise RuntimeError('Application database role is overprivileged')
            print('Readiness and least-privilege database checks passed')
        elif args.command == 'backup':
            stack.backup()
        elif args.command == 'restore':
            if not args.backup_path:
                raise ValueError('Provide the backup directory')
            stack.restore(args.backup_path.resolve())


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
