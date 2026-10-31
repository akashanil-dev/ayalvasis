from datetime import timedelta
import copy
from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError
from .common import require_admin, today, next_boundary, fingerprint


class Amendment(models.Model):
    _name = 'ayal.subscription.amendment'
    _description = 'Scheduled subscription quantity revision'
    _order = 'effective_date,id'
    subscription_id = fields.Many2one('ayal.subscription', required=True, ondelete='restrict', index=True)
    company_id = fields.Many2one(related='subscription_id.company_id', store=True)
    line_id = fields.Many2one('ayal.subscription.line', required=True, ondelete='restrict')
    quantity = fields.Integer(required=True)
    effective_date = fields.Date(required=True)
    reason = fields.Text(required=True)
    state = fields.Selection([('pending', 'Scheduled'), ('applied', 'Applied'), ('cancelled', 'Cancelled')], default='pending', required=True)
    before_snapshot = fields.Json(readonly=True)
    after_snapshot = fields.Json(readonly=True)
    _positive = models.Constraint('CHECK(quantity > 0)', 'Quantity must be positive.')

    @api.model_create_multi
    def create(self, vals):
        if not self.env.su:
            raise AccessError(_('Use the amendment wizard.'))
        return super().create(vals)

    def write(self, vals):
        if not self.env.su:
            raise AccessError(_('Amendment history is immutable.'))
        return super().write(vals)

    def unlink(self):
        raise AccessError(_('Amendments are permanent audit records.'))

    def action_cancel(self):
        require_admin(self.env)
        for rec in self:
            rec.check_access('read')
            rec.subscription_id._lock()
            if rec.state != 'pending':
                raise UserError(_('Only scheduled amendments can be cancelled.'))
            rec.sudo().write({'state': 'cancelled'})
            rec.subscription_id._event('amendment_cancelled', rec.reason)
        return True

    def _apply(self):
        from .subscription import SubscriptionLine
        for rec in self:
            if rec.state != 'pending':
                continue
            contract = rec.subscription_id
            before = copy.deepcopy(contract.snapshot)
            # Private engine path: no caller-controlled context bypass.
            super(SubscriptionLine, rec.line_id.sudo()).write({'quantity': rec.quantity})
            after = copy.deepcopy(before)
            after['lines'] = [{'product_id': l.product_id.id, 'name': l.name, 'quantity': l.quantity,
                              'price_unit': l.price_unit, 'tax_ids': l.tax_ids.ids,
                              'tax_labels': l.tax_ids.mapped('name')} for l in contract.line_ids]
            after['revision_date'] = str(rec.effective_date)
            contract._save({'snapshot': after, 'snapshot_hash': fingerprint(after)})
            rec.sudo().write({'before_snapshot': before, 'after_snapshot': after, 'state': 'applied'})
            contract._event('quantity_amended', rec.reason)


class AmendmentWizard(models.TransientModel):
    _name = 'ayal.subscription.amend'
    _description = 'Schedule a quantity change'
    subscription_id = fields.Many2one('ayal.subscription', required=True)
    line_id = fields.Many2one('ayal.subscription.line', required=True, domain="[('subscription_id','=',subscription_id)]")
    quantity = fields.Integer(required=True, default=1)
    effective_date = fields.Date(required=True)
    reason = fields.Text(required=True)

    def action_schedule(self):
        require_admin(self.env)
        self.ensure_one()
        rec = self.subscription_id
        rec.check_access('write')
        rec._lock()
        if rec.state not in ('confirmed', 'active') or rec.pending_action:
            raise UserError(_('Only an ongoing contract without a pending lifecycle change can be amended.'))
        if self.line_id.subscription_id != rec or self.quantity < 1 or not self.reason.strip():
            raise UserError(_('Select a contract line, a positive quantity and an amendment reason.'))
        if self.line_id.product_id.id == rec.snapshot['primary_product_id'] and self.quantity < rec.snapshot['min_quantity']:
            raise UserError(_('The quantity is below the plan minimum.'))
        effective = max(rec.next_billing_date, today(rec) + timedelta(days=1))
        if effective != rec.next_billing_date:
            effective = next_boundary(rec.anchor_date, rec.snapshot['cadence'], today(rec))
        if self.effective_date != effective or self.effective_date > rec.expiry_date:
            raise UserError(_('The amendment must take effect at the next unbilled future boundary: %s.', effective))
        if rec.amendment_ids.filtered(lambda a: a.state == 'pending'):
            raise UserError(_('Cancel or apply the existing scheduled amendment first.'))
        self.env['ayal.subscription.amendment'].sudo().create({'subscription_id': rec.id, 'line_id': self.line_id.id,
            'quantity': self.quantity, 'effective_date': self.effective_date, 'reason': self.reason})
        rec._event('quantity_change_scheduled', self.reason)
        return {'type': 'ir.actions.act_window_close'}
