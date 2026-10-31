from . import models
from . import controllers


def pre_init_hook(env):
    from odoo import release
    if release.version_info[0] != 19:
        raise RuntimeError('This release requires Odoo 19. Validate and migrate before changing major versions.')


def post_init_hook(env):
    params = env['ir.config_parameter'].sudo()
    if not params.get_param('report.url'):
        # wkhtmltopdf runs inside the Odoo container. Published host ports and
        # public DNS are not reliable paths back to its own report assets.
        params.set_param('report.url', 'http://127.0.0.1:8069')
