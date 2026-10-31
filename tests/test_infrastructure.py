import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


stack = module('stack', ROOT / 'scripts/stack.py')
storage = module('storage', ROOT / 'infra/odoo/storage.py')


class InfrastructureTests(unittest.TestCase):
    def test_composed_network_and_secret_boundaries(self):
        for mode in ('dev', 'prod'):
            result = subprocess.run(['docker', 'compose', '--env-file', '.env.example', '-f', 'compose.yaml',
                                     '-f', f'compose.{mode}.yaml', '--profile', 'ops', 'config', '--format', 'json'],
                                    cwd=ROOT, capture_output=True, text=True, check=True)
            config = json.loads(result.stdout)
            services = config['services']
            self.assertFalse(services['db'].get('ports'))
            self.assertTrue(config['networks']['backend']['internal'])
            self.assertEqual(set(services['db']['networks']), {'backend'})
            self.assertTrue(services['odoo']['read_only'])
            self.assertNotIn('admin_password', [item['source'] for item in services['odoo']['secrets']])
            if mode == 'prod':
                self.assertFalse(services['odoo'].get('ports'))
                self.assertEqual({str(item['published']) for item in services['proxy']['ports']}, {'80', '443'})
            else:
                self.assertEqual(services['odoo']['ports'][0]['host_ip'], '127.0.0.1')

    def test_setup_preserves_credentials_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(stack, 'ROOT', Path(folder)):
            root = Path(folder)
            (root / '.env.example').write_text((ROOT / '.env.example').read_text())
            target = root / '.env'
            stack.setup(target, 'dev')
            password = (root / '.secrets/dev/admin_password').read_bytes()
            self.assertGreaterEqual(len(password), 48)
            self.assertEqual((root / '.secrets').stat().st_mode & 0o777, 0o700)
            with self.assertRaises(RuntimeError):
                stack.setup(target, 'dev')
            self.assertEqual(password, (root / '.secrets/dev/admin_password').read_bytes())

    def test_filestore_roundtrip(self):
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as target:
            source_path = Path(source)
            sample = source_path / 'filestore/ayalvasis/ab/attachment'
            sample.parent.mkdir(parents=True)
            sample.write_bytes(b'attachment payload\x00\xff')
            archive = io.BytesIO()
            with patch.object(storage, 'ROOT', source_path):
                storage.export_store(archive)
            archive.seek(0)
            with patch.object(storage, 'ROOT', Path(target)):
                storage.import_store(archive)
                self.assertEqual((Path(target) / sample.relative_to(source_path)).read_bytes(), sample.read_bytes())
                archive.seek(0)
                with self.assertRaises(RuntimeError):
                    storage.import_store(archive)

    def test_restore_rejects_path_traversal_and_links(self):
        for name, kind in [('filestore/../../escaped', tarfile.REGTYPE), ('/etc/escaped', tarfile.REGTYPE),
                           ('filestore/link', tarfile.SYMTYPE), ('filestore/device', tarfile.CHRTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                archive = io.BytesIO()
                with tarfile.open(fileobj=archive, mode='w:gz') as output:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    entry.linkname = '/etc/passwd' if kind == tarfile.SYMTYPE else ''
                    output.addfile(entry)
                archive.seek(0)
                with patch.object(storage, 'ROOT', Path(folder)), self.assertRaises(ValueError):
                    storage.import_store(archive)

    def test_backup_restarts_application_after_dump_failure(self):
        instance = object.__new__(stack.Stack)
        instance.values = {'COMPOSE_PROJECT_NAME': 'test', 'DB_NAME': 'ayalvasis'}
        calls = []

        def execute(*args, **kwargs):
            calls.append(args)
            if args[0] == 'exec':
                raise subprocess.CalledProcessError(1, 'pg_dump')

        with tempfile.TemporaryDirectory() as folder, patch.object(stack, 'ROOT', Path(folder)), \
                patch.object(instance, 'database_up'), patch.object(instance, 'output', return_value='odoo\nproxy'), \
                patch.object(instance, 'run', side_effect=execute):
            with self.assertRaises(subprocess.CalledProcessError):
                instance.backup()
            self.assertIn(('start', 'odoo', 'proxy'), calls)
            self.assertFalse(list(Path(folder).rglob('COMPLETE')))

    def test_restore_rejects_corrupt_backup_before_starting_database(self):
        instance = object.__new__(stack.Stack)
        instance.values = {'DB_NAME': 'ayalvasis', 'APP_IMAGE': 'app:1', 'ODOO_IMAGE': 'odoo:19.0', 'POSTGRES_IMAGE': 'postgres:17'}
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / 'COMPLETE').touch()
            (directory / 'database.dump').write_bytes(b'corrupted')
            (directory / 'manifest.json').write_text(stack.json.dumps({
                'version': 1, 'database': 'ayalvasis', 'images': instance.values,
                'sha256': {'database.dump': '0' * 64},
            }))
            with patch.object(instance, 'database_up') as start:
                with self.assertRaisesRegex(ValueError, 'Checksum'):
                    instance.restore(directory)
                start.assert_not_called()


if __name__ == '__main__':
    unittest.main()
