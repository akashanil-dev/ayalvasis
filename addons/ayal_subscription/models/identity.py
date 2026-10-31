from odoo import api, fields, models, _
from odoo.exceptions import AccessError, ValidationError
from .common import admin, password_policy


class ResUsers(models.Model):
    _inherit = 'res.users'

    ayal_email_key = fields.Char(compute='_compute_ayal_email_key', store=True, index=True, copy=False)
    _ayal_email_unique = models.Constraint('UNIQUE(ayal_email_key)', 'An account already uses this email address.')

    @api.depends('email')
    def _compute_ayal_email_key(self):
        for user in self:
            user.ayal_email_key = (user.email or '').strip().casefold() or False

    @api.model_create_multi
    def create(self, vals_list):
        prepared = []
        for values in vals_list:
            values = dict(values)
            if values.get('password'):
                password_policy(values['password'])
            if '@' in values.get('login', ''):
                values['login'] = values['login'].strip().casefold()
            if values.get('email'):
                values['email'] = values['email'].strip().casefold()
            if not admin(self.env):
                raise AccessError(_('Only an administrator can provision user accounts.'))
            prepared.append(values)
        return super().create(prepared)

    def write(self, vals):
        vals = dict(vals)
        if vals.get('password'):
            password_policy(vals['password'])
        if not admin(self.env) and set(vals) & {'group_ids', 'role', 'company_ids', 'active', 'login'}:
            raise AccessError(_('Only an administrator can change account access.'))
        if '@' in vals.get('login', ''):
            vals['login'] = vals['login'].strip().casefold()
        if vals.get('email'):
            vals['email'] = vals['email'].strip().casefold()
        return super().write(vals)

    @api.model
    def _get_login_domain(self, login):
        return super()._get_login_domain((login or '').strip().casefold())

    @api.model
    def reset_password(self, login):
        login = (login or '').strip().casefold()
        if not self.sudo().with_context(active_test=False).search_count([('login', '=', login)]):
            return True
        return super().reset_password(login)


class AuthThrottle(models.Model):
    _name = 'ayal.auth.throttle'
    _description = 'Authentication request limit'
    key = fields.Char(required=True, index=True)
    window = fields.Datetime(required=True)
    attempts = fields.Integer(default=0)
    _key_unique = models.Constraint('UNIQUE(key)', 'Unique throttle key required.')

    def _allow(self, key):
        self.env.cr.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', [key])
        entry = self.sudo().search([('key', '=', key)], limit=1)
        now = fields.Datetime.now()
        if not entry:
            self.sudo().create({'key': key, 'window': now, 'attempts': 1})
        elif (now - entry.window).total_seconds() > 900:
            entry.write({'window': now, 'attempts': 1})
        elif entry.attempts >= 10:
            return False
        else:
            entry.attempts += 1
        return True

    @api.autovacuum
    def _clean(self):
        from datetime import timedelta
        self.sudo().search([('window', '<', fields.Datetime.now() - timedelta(days=2))]).unlink()


class StaffInvite(models.TransientModel):
    _name = 'ayal.staff.invite'
    _description = 'Provision subscription staff'
    name = fields.Char(required=True)
    email = fields.Char(required=True)
    role = fields.Selection([('staff', 'Subscription staff'), ('finance', 'Subscription billing')], default='staff', required=True)
    send_invitation = fields.Boolean(default=False, help='Send a password setup email through the configured outgoing mail server.')

    def action_create(self):
        from odoo.tools import email_normalize
        from .common import require_admin
        require_admin(self.env)
        self.ensure_one()
        email = email_normalize(self.email)
        if not email:
            raise ValidationError(_('Enter a valid email address.'))
        email = email.strip().casefold()
        group = self.env.ref('ayal_subscription.group_finance' if self.role == 'finance' else 'ayal_subscription.group_staff')
        user = self.env['res.users'].sudo().with_context(no_reset_password=True).create({
            'name': self.name, 'login': email, 'email': email, 'company_id': self.env.company.id,
            'company_ids': [(6, 0, [self.env.company.id])], 'group_ids': [(6, 0, group.ids)]})
        if self.send_invitation:
            user.action_reset_password()
        return {'type': 'ir.actions.client', 'tag': 'display_notification', 'params': {
            'title': _('Staff account created'), 'message': _('The selected subscription role has been assigned.'),
            'type': 'success', 'next': {'type': 'ir.actions.act_window_close'}}}
