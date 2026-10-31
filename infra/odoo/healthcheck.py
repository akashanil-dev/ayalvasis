"""Readiness: database-backed login page, not just a listening TCP socket."""
from urllib.request import urlopen

with urlopen('http://127.0.0.1:8069/web/login', timeout=5) as response:
    if response.status != 200 or b'name="login"' not in response.read():
        raise SystemExit('Odoo login page is not ready')
