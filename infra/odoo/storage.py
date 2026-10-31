"""Stream the filestore; never overwrite an existing restore target."""
from pathlib import Path
import sys
import tarfile

ROOT = Path('/var/lib/odoo')


def export_store(output):
    with tarfile.open(fileobj=output, mode='w|gz') as archive:
        store = ROOT / 'filestore'
        if store.exists():
            archive.add(store, arcname='filestore')


def import_store(source):
    store = ROOT / 'filestore'
    if store.exists() and any(store.iterdir()):
        raise RuntimeError('Filestore is not empty; restore requires a fresh target')
    with tarfile.open(fileobj=source, mode='r|gz') as archive:
        for member in archive:
            parts = Path(member.name).parts
            if not parts or parts[0] != 'filestore' or '..' in parts:
                raise ValueError('Unexpected archive path')
            if not (member.isdir() or member.isfile()):
                raise ValueError('Links and special files are not accepted')
            archive.extract(member, path=ROOT, filter='data')


if __name__ == '__main__':
    if sys.argv[1:] == ['export']:
        export_store(sys.stdout.buffer)
    elif sys.argv[1:] == ['import']:
        import_store(sys.stdin.buffer)
    else:
        raise SystemExit('Expected export or import')
