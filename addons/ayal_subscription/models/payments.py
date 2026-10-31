import uuid
from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError
from .common import require_finance, fingerprint


class Receipt(models.Model):
    _name = 'ayal.payment.receipt'
    _description = 'Idempotent manual payment receipt'
    company_id = fields.Many2one('res.company', required=True, index=True)
    invoice_id = fields.Many2one('account.move', required=True, ondelete='restrict')
    request_key = fields.Char(required=True, index=True)
    reference = fields.Char(required=True)
    payload_hash = fields.Char(required=True)
    payment_ids = fields.Many2many('account.payment')
    _key_unique = models.Constraint('UNIQUE(company_id,request_key)', 'This payment request was already processed.')
    _reference_unique = models.Constraint('UNIQUE(company_id,reference)', 'This payment reference was already recorded.')

    @api.model_create_multi
    def create(self, vals):
        if not self.env.su:
            raise AccessError(_('Payment receipts are created by the payment workflow.'))
        return super().create(vals)

    def write(self, vals):
        raise AccessError(_('Payment receipts are immutable.'))

    def unlink(self):
        raise AccessError(_('Payment receipts cannot be deleted.'))


class PaymentRegister(models.TransientModel):
    _inherit = 'account.payment.register'
    ayal_request_key = fields.Char(default=lambda s: str(uuid.uuid4()), readonly=True, copy=False)
    ayal_reference = fields.Char(string='Payment reference', help='Unique bank receipt or cash receipt reference, required for subscription invoices.')

    def _create_payments(self):
        self.ensure_one()
        invoices = self.line_ids.move_id.filtered('ayal_period_id')
        if not invoices:
            return super()._create_payments()
        require_finance(self.env)
        if len(invoices) != 1 or len(self.line_ids.move_id) != 1:
            raise UserError(_('Register subscription payments one invoice at a time.'))
        invoice = invoices
        invoice.check_access('write')
        invoice.ayal_period_id.subscription_id._lock()
        reference = (self.ayal_reference or '').strip().casefold()
        if not reference:
            raise UserError(_('Enter a unique payment reference from your bank or cash receipt.'))
        payload = fingerprint([invoice.id, self.amount, str(self.payment_date), self.journal_id.id,
                               self.payment_method_line_id.id, reference, self.communication])
        receipts = self.env['ayal.payment.receipt'].sudo()
        existing = receipts.search([('company_id', '=', invoice.company_id.id), '|',
                    ('request_key', '=', self.ayal_request_key), ('reference', '=', reference)], limit=1)
        if existing:
            if existing.payload_hash != payload:
                raise UserError(_('This payment reference belongs to a different payment.'))
            return existing.payment_ids.with_env(self.env)
        invoice.invalidate_recordset(['amount_residual'])
        if invoice.state != 'posted' or self.amount <= 0 or invoice.currency_id.compare_amounts(self.amount, invoice.amount_residual) > 0:
            raise UserError(_('Payment must be positive and cannot exceed the posted invoice balance.'))
        if not self.payment_method_line_id.payment_account_id:
            raise UserError(_('Configure an outstanding receipts account on this payment method before recording a payment.'))
        result = super()._create_payments()
        receipts.create({'company_id': invoice.company_id.id, 'invoice_id': invoice.id, 'reference': reference,
                          'request_key': self.ayal_request_key, 'payload_hash': payload, 'payment_ids': [(6, 0, result.ids)]})
        invoice.ayal_period_id.subscription_id._event('payment_registered', reference)
        return result
