#!/usr/bin/env python3
"""Real startup/authentication/backup/restore drill in disposable, isolated projects."""
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import uuid
from urllib.request import Request, urlopen

from stack import ROOT, Stack, read_env


def available_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def cli(path, *args):
    subprocess.run([sys.executable, str(ROOT / 'scripts/stack.py'), '--env-file', str(path), *args], check=True)


def main():
    values = read_env(ROOT / '.env')
    identifier = uuid.uuid4().hex[:10]
    files = []
    stacks = []
    try:
        for suffix in ('source', 'restore'):
            target = dict(values, COMPOSE_PROJECT_NAME=f'ayalvasis-smoke-{identifier}-{suffix}', LOCAL_PORT=str(available_port()))
            if suffix == 'restore':
                # Exercise the production process model without exposing public ports.
                target.update(ODOO_WORKERS='2', ODOO_PROXY_MODE='True')
            folder = ROOT / '.state'
            folder.mkdir(exist_ok=True)
            path = folder / f'smoke-{identifier}-{suffix}.env'
            path.write_text(''.join(f'{key}={value}\n' for key, value in target.items()))
            files.append(path)
            stacks.append(Stack(path, 'dev'))
        source, restored = stacks
        cli(files[0], 'init')
        cli(files[0], 'up')
        cli(files[0], 'check')
        request = Request(f"http://127.0.0.1:{source.values['LOCAL_PORT']}/web/session/authenticate",
                          data=json.dumps({'jsonrpc': '2.0', 'method': 'call', 'id': 1, 'params': {
                              'db': values['DB_NAME'], 'login': values['ADMIN_LOGIN'],
                              'password': (ROOT / values['SECRET_DIR'] / 'admin_password').read_text().strip(),
                          }}).encode(), headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=30) as response:
            result = json.load(response)
            if not result.get('result', {}).get('uid'):
                raise RuntimeError('Generated administrator login failed')
        source.sql(f"SET ROLE {values['DB_USER']}; CREATE TABLE infra_restore_probe (payload text); INSERT INTO infra_restore_probe VALUES ('restore-verified');")
        payload = b'filestore restore probe\x00\xff'
        source.run('exec', '-T', 'odoo', 'python3', '-c',
                   f"from pathlib import Path; import sys; p=Path('/var/lib/odoo/filestore/{values['DB_NAME']}/infra-probe'); p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(sys.stdin.buffer.read())",
                   input=payload)
        cli(files[0], 'backup')
        backup = next((ROOT / 'backups' / source.values['COMPOSE_PROJECT_NAME']).iterdir())
        cli(files[1], 'restore', str(backup))
        cli(files[1], 'up')
        cli(files[1], 'check')
        restored.run('exec', '-T', 'odoo', 'python3', '-c',
                     "import socket; socket.create_connection(('127.0.0.1', 8072), timeout=5).close()")
        if restored.sql('SELECT payload FROM infra_restore_probe;') != 'restore-verified':
            raise RuntimeError('Database restore lost probe record')
        actual = restored.run('exec', '-T', 'odoo', 'python3', '-c',
                              f"from pathlib import Path; import sys; sys.stdout.buffer.write(Path('/var/lib/odoo/filestore/{values['DB_NAME']}/infra-probe').read_bytes())",
                              capture_output=True).stdout
        if actual != payload:
            raise RuntimeError('Filestore restore lost probe bytes')
        rejected = subprocess.run([sys.executable, str(ROOT / 'scripts/stack.py'), '--env-file', str(files[1]), 'init'], capture_output=True)
        if rejected.returncode == 0:
            raise RuntimeError('Reinitializing existing data should fail')
        print('PASS: secure bootstrap, login, readiness, DB privileges, database+filestore restore, multi-worker/WebSocket listener, reinitialization guard')
    finally:
        for item in stacks:
            if not item.values['COMPOSE_PROJECT_NAME'].startswith(f'ayalvasis-smoke-{identifier}-'):
                raise RuntimeError('Refusing to clean an unrelated project')
            try:
                item.run('down', '--volumes', '--remove-orphans')
            except subprocess.CalledProcessError:
                print('Smoke cleanup failed; inspect the isolated project', file=sys.stderr)
            shutil.rmtree(ROOT / 'backups' / item.values['COMPOSE_PROJECT_NAME'], ignore_errors=True)
        for path in files:
            path.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
