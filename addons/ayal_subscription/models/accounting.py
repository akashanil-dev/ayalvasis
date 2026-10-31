from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError
from .common import require_finance

_POSTING_CAPABILITY = object()


class SaleOrder(models.Model):
    _inherit = 'sale.order'
    ayal_subscription_id = fields.Many2one('ayal.subscription', copy=False, readonly=True, index=True)

    def _create_invoices(self, grouped=False, final=False, date=None):
        if self.filtered('ayal_subscription_id'):
            raise UserError(_('Use subscription billing to prevent duplicate invoices.'))
        return super()._create_invoices(grouped=grouped, final=final, date=date)

    def write(self, vals):
        if not self.env.su and self.filtered('ayal_subscription_id') and set(vals) & {'order_line', 'partner_id', 'company_id', 'ayal_subscription_id'}:
            raise UserError(_('Change subscription commercial terms through the subscription workflow.'))
        return super().write(vals)


class SaleLine(models.Model):
    _inherit = 'sale.order.line'

    @api.model_create_multi
    def create(self, vals):
        if not self.env.su and any(self.env['sale.order'].browse(v.get('order_id')).ayal_subscription_id for v in vals if v.get('order_id')):
            raise UserError(_('Accepted subscription order lines are immutable.'))
        return super().create(vals)

    def write(self, vals):
        if not self.env.su and any(l.order_id.ayal_subscription_id for l in self):
            raise UserError(_('Accepted subscription order lines are immutable.'))
        return super().write(vals)

    def unlink(self):
        if not self.env.su and any(l.order_id.ayal_subscription_id for l in self):
            raise UserError(_('Subscription order lines cannot be deleted.'))
        return super().unlink()


class Invoice(models.Model):
    _inherit = 'account.move'
    ayal_period_id = fields.Many2one('ayal.billing.period', copy=False, readonly=True, index=True, ondelete='restrict')

    @api.model_create_multi
    def create(self, vals):
        if not self.env.su and any(v.get('ayal_period_id') for v in vals):
            raise AccessError(_('Only the billing engine can link recurring invoices.'))
        return super().create(vals)

    def write(self, vals):
        recurring = self.filtered(lambda r: r.ayal_period_id and r.move_type == 'out_invoice')
        if recurring and 'state' in vals:
            require_finance(self.env)
            for invoice in recurring:
                invoice.ayal_period_id.subscription_id._lock()
                if vals['state'] == 'posted' and self.env.context.get('_ayal_posting') is not _POSTING_CAPABILITY:
                    raise UserError(_('Use the Post action to issue recurring invoices.'))
                if vals['state'] in ('draft', 'cancel') and invoice.posted_before:
                    raise UserError(_('Use a credit note to correct an issued recurring invoice.'))
                if vals['state'] == 'draft' and invoice.state == 'cancel':
                    raise UserError(_('Use the billing-period reissue action.'))
        if not self.env.su:
            if 'ayal_period_id' in vals:
                raise AccessError(_('Recurring billing links are immutable.'))
            if self.filtered('ayal_period_id') and set(vals) & {'invoice_line_ids', 'partner_id', 'company_id', 'currency_id', 'invoice_date'}:
                raise UserError(_('Recurring invoice commercial fields are immutable. Cancel and reissue, or use a credit note.'))
        result = super().write(vals)
        if vals.get('state') == 'cancel':
            for invoice in recurring.filtered(lambda i: i.ayal_period_id.reservation == 'reserved'):
                invoice.ayal_period_id.sudo().write({'reservation': 'released'})
        if vals.get('state') == 'posted':
            for invoice in recurring.filtered(lambda i: i.ayal_period_id.discount_id):
                invoice.ayal_period_id.sudo().write({'reservation': 'consumed'})
        return result

    def _post(self, soft=True):
        for invoice in self.filtered(lambda i: i.ayal_period_id and i.move_type == 'out_invoice'):
            require_finance(self.env)
            invoice.ayal_period_id.subscription_id._lock()
            if invoice.ayal_period_id.invoice_id != invoice:
                raise UserError(_('This recurring invoice was replaced.'))
        return super(Invoice, self.with_context(_ayal_posting=_POSTING_CAPABILITY))._post(soft=soft)

    def action_post(self):
        recurring = self.filtered(lambda r: r.ayal_period_id and r.move_type == 'out_invoice')
        if recurring:
            require_finance(self.env)
            for invoice in recurring:
                period = invoice.ayal_period_id
                period.subscription_id._lock()
                if period.invoice_id != invoice:
                    raise UserError(_('This invoice has been replaced.'))
        result = super().action_post()
        for invoice in recurring:
            if invoice.ayal_period_id.discount_id:
                invoice.ayal_period_id.sudo().write({'reservation': 'consumed'})
        return result

    def button_cancel(self):
        recurring = self.filtered(lambda r: r.ayal_period_id and r.move_type == 'out_invoice')
        if recurring:
            require_finance(self.env)
            for invoice in recurring:
                invoice.ayal_period_id.subscription_id._lock()
        result = super().button_cancel()
        for invoice in recurring:
            if not invoice.posted_before and invoice.ayal_period_id.reservation == 'reserved':
                invoice.ayal_period_id.sudo().write({'reservation': 'released'})
        return result

    def button_draft(self):
        if self.filtered(lambda r: r.ayal_period_id and r.state == 'cancel'):
            raise UserError(_('Use the billing-period reissue action for cancelled recurring invoices.'))
        return super().button_draft()

    def copy(self, default=None):
        if self.ayal_period_id and not self.env.su:
            raise UserError(_('Use the billing-period reissue action instead of duplicating an invoice.'))
        return super().copy(default)

    def unlink(self):
        if self.filtered('ayal_period_id'):
            raise UserError(_('Recurring invoices are retained for audit. Cancel them instead.'))
        return super().unlink()


class InvoiceLine(models.Model):
    _inherit = 'account.move.line'
    # Preserve precision when allocating an exact fixed discount across quantities.
    discount = fields.Float(digits=(16, 8))

    @api.model_create_multi
    def create(self, vals):
        if not self.env.su:
            for value in vals:
                move = self.env['account.move'].browse(value.get('move_id'))
                if move.ayal_period_id and value.get('display_type', 'product') == 'product':
                    raise UserError(_('Recurring invoice lines are generated from the accepted contract.'))
        return super().create(vals)

    def write(self, vals):
        protected = {'product_id', 'quantity', 'price_unit', 'discount', 'tax_ids', 'account_id', 'move_id', 'name'}
        if not self.env.su and set(vals) & protected and any(l.move_id.ayal_period_id and l.display_type == 'product' for l in self):
            raise UserError(_('Recurring invoice commercial lines are immutable.'))
        return super().write(vals)

    def unlink(self):
        if not self.env.su and any(l.move_id.ayal_period_id and l.display_type == 'product' for l in self):
            raise UserError(_('Recurring invoice commercial lines cannot be deleted.'))
        return super().unlink()


class AcceptedPaymentTerm(models.Model):
    _inherit = 'account.payment.term'

    def write(self, vals):
        if self.env['ayal.subscription'].sudo().search_count([('accepted_payment_term_id', 'in', self.ids)]):
            raise UserError(_('Accepted subscription payment terms are immutable.'))
        return super().write(vals)

    def unlink(self):
        if self.env['ayal.subscription'].sudo().search_count([('accepted_payment_term_id', 'in', self.ids)]):
            raise UserError(_('Accepted subscription payment terms must be retained.'))
        return super().unlink()


class AcceptedPaymentTermLine(models.Model):
    _inherit = 'account.payment.term.line'

    @api.model_create_multi
    def create(self, vals):
        terms = [v.get('payment_id') for v in vals if v.get('payment_id')]
        if terms and self.env['ayal.subscription'].sudo().search_count([('accepted_payment_term_id', 'in', terms)]):
            raise UserError(_('Accepted subscription payment terms are immutable.'))
        return super().create(vals)

    def write(self, vals):
        if self.env['ayal.subscription'].sudo().search_count([('accepted_payment_term_id', 'in', self.payment_id.ids)]):
            raise UserError(_('Accepted subscription payment terms are immutable.'))
        return super().write(vals)

    def unlink(self):
        if self.env['ayal.subscription'].sudo().search_count([('accepted_payment_term_id', 'in', self.payment_id.ids)]):
            raise UserError(_('Accepted subscription payment terms are immutable.'))
        return super().unlink()
