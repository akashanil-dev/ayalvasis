from datetime import timedelta
import json
import time

from odoo import api, fields, models, Command, _
from odoo.exceptions import AccessError, UserError, ValidationError
from .common import require_staff, require_admin, admin, staff, today, next_boundary, fingerprint


class Subscription(models.Model):
    _name = 'ayal.subscription'
    _description = 'Subscription contract'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _check_company_auto = True
    _order = 'id desc'

    name = fields.Char(default='New', required=True, copy=False, readonly=True, index=True)
    company_id = fields.Many2one('res.company', required=True, default=lambda s: s.env.company, index=True)
    currency_id = fields.Many2one(related='company_id.currency_id', store=True)
    partner_id = fields.Many2one('res.partner', required=True, check_company=True, index=True, tracking=True)
    plan_id = fields.Many2one('ayal.subscription.plan', required=True, check_company=True)
    state = fields.Selection([(s, s.title()) for s in ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed')], default='draft', required=True, copy=False, tracking=True, index=True)
    start_date = fields.Date(required=True, default=fields.Date.context_today)
    expiry_date = fields.Date(required=True)
    quote_valid_until = fields.Date(required=True, default=lambda s: fields.Date.context_today(s) + timedelta(days=30))
    terms = fields.Text()
    backdate_reason = fields.Text()
    catchup_preview = fields.Text(compute='_compute_catchup_preview')
    payment_term_id = fields.Many2one('account.payment.term', check_company=True)
    accepted_payment_term_id = fields.Many2one('account.payment.term', readonly=True, copy=False, check_company=True)
    amendment_ids = fields.One2many('ayal.subscription.amendment', 'subscription_id')
    template_id = fields.Many2one('ayal.subscription.template', check_company=True)
    line_ids = fields.One2many('ayal.subscription.line', 'subscription_id', copy=True)
    amount_untaxed = fields.Monetary(compute='_totals')
    amount_tax = fields.Monetary(compute='_totals')
    amount_total = fields.Monetary(compute='_totals')
    cadence = fields.Selection(related='plan_id.cadence')
    snapshot = fields.Json(readonly=True, copy=False)
    snapshot_hash = fields.Char(readonly=True, copy=False)
    anchor_date = fields.Date(readonly=True, copy=False)
    next_billing_date = fields.Date(readonly=True, copy=False, index=True)
    pending_action = fields.Selection([('pause', 'Pause'), ('close', 'Close')], readonly=True, copy=False)
    effective_date = fields.Date(readonly=True, copy=False)
    awaiting_close = fields.Boolean(readonly=True, copy=False)
    billing_error = fields.Text(readonly=True, copy=False)
    retry_after = fields.Datetime(readonly=True, copy=False, index=True)
    order_id = fields.Many2one('sale.order', readonly=True, copy=False, check_company=True)
    predecessor_id = fields.Many2one('ayal.subscription', readonly=True, copy=False, check_company=True)
    period_ids = fields.One2many('ayal.billing.period', 'subscription_id')
    event_ids = fields.One2many('ayal.subscription.event', 'subscription_id')
    _successor_unique = models.Constraint('UNIQUE(predecessor_id)', 'A renewal already exists for this contract.')
    _dates = models.Constraint('CHECK(expiry_date >= start_date)', 'Expiry must be on or after start.')

    @api.depends('start_date', 'expiry_date', 'plan_id.cadence', 'amount_total')
    def _compute_catchup_preview(self):
        for rec in self:
            rows = []
            if rec.start_date and rec.expiry_date and rec.plan_id and rec.start_date < today(rec):
                start, end = rec.start_date, rec.expiry_date + timedelta(days=1)
                while start <= today(rec) and start < end and len(rows) < 24:
                    natural = next_boundary(rec.start_date, rec.plan_id.cadence, start)
                    stop = min(natural, end)
                    amount = rec.currency_id.round(rec.amount_total * (stop-start).days / (natural-start).days)
                    rows.append('%s → %s (exclusive): %s %s before conditional discounts' % (start, stop, amount, rec.currency_id.name))
                    start = stop
                if start <= today(rec) and start < end:
                    rows.append('Additional periods will be processed in subsequent billing batches.')
            rec.catchup_preview = '\n'.join(rows)

    @api.depends('line_ids.price_unit', 'line_ids.quantity', 'line_ids.tax_ids')
    def _totals(self):
        for rec in self:
            totals = [line.tax_ids.compute_all(line.price_unit, currency=rec.currency_id,
                      quantity=line.quantity, product=line.product_id, partner=rec.partner_id) for line in rec.line_ids]
            rec.amount_untaxed = sum(t['total_excluded'] for t in totals)
            rec.amount_total = sum(t['total_included'] for t in totals)
            rec.amount_tax = rec.amount_total - rec.amount_untaxed

    @api.model_create_multi
    def create(self, values):
        require_staff(self.env)
        for vals in values:
            if vals.get('backdate_reason'):
                require_admin(self.env)
            if 'payment_term_id' not in vals and vals.get('partner_id'):
                vals['payment_term_id'] = self.env['res.partner'].browse(vals['partner_id']).property_payment_term_id.id
            if set(vals) & self._protected():
                raise AccessError(_('Contract workflow fields cannot be supplied directly.'))
            if vals.get('template_id'):
                template = self.env['ayal.subscription.template'].browse(vals['template_id'])
                template.check_access('read')
                if not template.active:
                    raise UserError(_('This quotation template is archived.'))
                vals['plan_id'] = template.plan_id.id
                vals.setdefault('terms', template.terms)
                vals.setdefault('quote_valid_until', today(template) + timedelta(days=template.validity_days))
            vals['name'] = self.env['ir.sequence'].next_by_code('ayal.subscription') or 'New'
        records = super().create(values)
        for rec in records:
            if not rec.line_ids:
                rec._load_plan()
                if rec.template_id:
                    rec.write({'line_ids': [Command.create({'product_id': l.product_id.id, 'quantity': l.quantity,
                        'price_unit': l.price_unit, 'tax_ids': [Command.set(l.product_id.taxes_id.filtered(lambda t: t.company_id == rec.company_id).ids)]}) for l in rec.template_id.line_ids]})
        return records

    @api.model
    def _protected(self):
        return {'state', 'name', 'snapshot', 'snapshot_hash', 'anchor_date', 'next_billing_date',
                'pending_action', 'effective_date', 'awaiting_close', 'order_id', 'predecessor_id', 'billing_error', 'retry_after', 'accepted_payment_term_id'}

    def write(self, vals):
        require_staff(self.env)
        if 'backdate_reason' in vals:
            require_admin(self.env)
        if set(vals) & self._protected():
            raise AccessError(_('Use the contract workflow actions.'))
        commercial = {'company_id', 'currency_id', 'partner_id', 'plan_id', 'start_date', 'expiry_date', 'terms', 'line_ids', 'quote_valid_until', 'template_id', 'backdate_reason', 'payment_term_id'}
        if set(vals) & commercial and any(r.state not in ('draft', 'quotation') for r in self):
            raise UserError(_('Accepted commercial terms are immutable. Create a renewal.'))
        if vals.get('template_id'):
            template = self.env['ayal.subscription.template'].browse(vals['template_id'])
            template.check_access('read')
            vals = dict(vals, plan_id=template.plan_id.id, terms=template.terms,
                        quote_valid_until=today(template) + timedelta(days=template.validity_days))
        result = super().write(vals)
        if 'plan_id' in vals and 'line_ids' not in vals:
            for rec in self:
                rec.line_ids.unlink()
                rec._load_plan()
                if vals.get('template_id'):
                    rec.write({'line_ids': [Command.create({'product_id': l.product_id.id, 'quantity': l.quantity,
                        'price_unit': l.price_unit, 'tax_ids': [Command.set(l.product_id.taxes_id.filtered(lambda t: t.company_id == rec.company_id).ids)]}) for l in rec.template_id.line_ids]})
        return result

    def unlink(self):
        require_staff(self.env)
        if any(r.state != 'draft' for r in self):
            raise UserError(_('Only draft contracts can be deleted.'))
        return super().unlink()

    def _save(self, vals):
        return super(Subscription, self.sudo()).write(vals)

    def _lock(self):
        self.ensure_one()
        self.check_access('read')
        self.env.cr.execute('SELECT id FROM ayal_subscription WHERE id=%s FOR UPDATE', [self.id])
        self.invalidate_recordset()

    def _authorize(self, internal=False):
        self.ensure_one()
        self.check_access('read')
        if internal:
            require_staff(self.env)
        elif not staff(self.env) and self.partner_id != self.env.user.partner_id:
            raise AccessError(_('This is not your subscription.'))

    def _event(self, action, detail=''):
        self.env['ayal.subscription.event'].sudo().create({
            'subscription_id': self.id, 'actor_id': self.env.uid, 'action': action, 'detail': detail})

    def _load_plan(self):
        self.ensure_one()
        plan = self.plan_id
        values = [{'product_id': plan.product_id.id, 'quantity': plan.min_quantity,
                   'price_unit': plan.price + plan.product_id.price_extra,
                   'tax_ids': [Command.set(plan.product_id.taxes_id.filtered(lambda t: t.company_id == self.company_id).ids)]}]
        values += [{'product_id': line.product_id.id, 'quantity': line.quantity, 'price_unit': line.price_unit,
                    'tax_ids': [Command.set(line.product_id.taxes_id.filtered(lambda t: t.company_id == self.company_id).ids)]} for line in plan.line_ids]
        self.write({'line_ids': [Command.create(v) for v in values]})

    @api.onchange('template_id')
    def _onchange_template(self):
        if self.template_id:
            self.line_ids = [Command.clear()]
            self.plan_id = self.template_id.plan_id
            self.terms = self.template_id.terms
            self.quote_valid_until = today(self) + timedelta(days=self.template_id.validity_days)

    def action_send_quote(self):
        self._authorize(True)
        if self.state != 'quotation':
            raise UserError(_('Only quotations can be sent.'))
        if not self.partner_id.email:
            raise UserError(_('Add a customer email address first.'))
        self.env.ref('ayal_subscription.mail_quotation').send_mail(self.id, force_send=False)
        self._event('quotation_email_queued')
        return True

    def action_quote(self):
        for rec in self:
            rec._authorize(True)
            rec._lock()
            if rec.state != 'draft':
                raise UserError(_('Only drafts can become quotations.'))
            if not rec.line_ids:
                raise UserError(_('Add at least one recurring product.'))
            rec._save({'state': 'quotation'})
            rec._event('quoted')
        return True

    def action_confirm(self):
        for rec in self:
            rec._authorize()
            rec._lock()
            if rec.state in ('confirmed', 'active'):
                continue
            if rec.state != 'quotation':
                raise UserError(_('Only quotations can be accepted.'))
            now, plan = today(rec), rec.plan_id.sudo()
            if now > rec.quote_valid_until:
                raise UserError(_('This quotation has expired.'))
            if rec.start_date < now and not rec.backdate_reason:
                raise UserError(_('A backdated start requires an administrator reason. Review the catch-up service periods before accepting.'))
            if not plan.active or (plan.available_from and rec.start_date < plan.available_from) or (plan.available_until and rec.start_date > plan.available_until):
                raise UserError(_('The plan is unavailable on the start date.'))
            if sum(rec.line_ids.filtered(lambda l: l.product_id == plan.product_id).mapped('quantity')) < plan.min_quantity:
                raise UserError(_('The plan minimum quantity is not met.'))
            accepted_term = rec.payment_term_id.sudo().copy({'name': '%s [%s]' % (rec.payment_term_id.name, rec.name)}) if rec.payment_term_id else rec.payment_term_id
            snapshot = {'payment_term_id': accepted_term.id, 'backdate_reason': rec.backdate_reason or '', 'partner_id': rec.partner_id.id, 'company_id': rec.company_id.id, 'currency': rec.currency_id.name,
                        'start_date': str(rec.start_date), 'expiry_date': str(rec.expiry_date), 'plan_name': plan.name,
                        'cadence': plan.cadence, 'min_quantity': plan.min_quantity, 'primary_product_id': plan.product_id.id, 'auto_close': plan.auto_close, 'auto_post': plan.auto_post,
                        'allow_close': plan.allow_close, 'allow_pause': plan.allow_pause, 'allow_renew': plan.allow_renew,
                        'terms': rec.terms or '', 'lines': [{'product_id': l.product_id.id, 'quantity': l.quantity,
                        'name': l.name, 'price_unit': l.price_unit, 'tax_ids': l.tax_ids.ids,
                        'tax_labels': l.tax_ids.mapped('name')} for l in rec.line_ids]}
            order = self.env['sale.order'].sudo().with_company(rec.company_id).create({
                'partner_id': rec.partner_id.id, 'company_id': rec.company_id.id,
                'validity_date': rec.quote_valid_until, 'note': rec.terms, 'payment_term_id': accepted_term.id, 'ayal_subscription_id': rec.id,
                'order_line': [Command.create({'product_id': l.product_id.id, 'name': l.name,
                     'product_uom_qty': l.quantity, 'price_unit': l.price_unit, 'tax_ids': [Command.set(l.tax_ids.ids)]}) for l in rec.line_ids]})
            order.action_confirm()
            rec._save({'state': 'confirmed', 'snapshot': snapshot, 'snapshot_hash': fingerprint(snapshot),
                       'anchor_date': rec.start_date, 'next_billing_date': rec.start_date, 'order_id': order.id, 'accepted_payment_term_id': accepted_term.id})
            rec._event('accepted', rec.snapshot_hash)
        return True

    def action_activate(self):
        for rec in self:
            rec._authorize(True)
            rec._lock()
            if rec.state == 'active':
                continue
            if rec.state != 'confirmed' or rec.anchor_date > today(rec):
                raise UserError(_('Only confirmed contracts whose start date has arrived can activate.'))
            rec._save({'state': 'active'})
            rec._event('activated')
        return True

    def _request_stop(self, action):
        self._authorize()
        self._lock()
        if self.pending_action == action or (action == 'close' and self.state == 'closed'):
            return True
        if self.state not in ('active', 'confirmed', 'paused'):
            raise UserError(_('This contract cannot be paused or closed in its current state.'))
        if not self.snapshot.get('allow_' + action):
            raise UserError(_('This plan does not allow that action.'))
        if self.pending_action:
            raise UserError(_('A lifecycle change is already scheduled.'))
        if self.state == 'paused' or self.next_billing_date >= self.expiry_date + timedelta(days=1):
            if action != 'close':
                raise UserError(_('The subscription is already paused or expired.'))
            self._save({'state': 'closed', 'awaiting_close': False})
        else:
            # An unbilled interval that has already begun remains payable.
            effective = self.next_billing_date
            while effective <= today(self):
                effective = next_boundary(self.anchor_date, self.snapshot['cadence'], effective)
            effective = min(effective, self.expiry_date + timedelta(days=1))
            self._save({'pending_action': action, 'effective_date': effective})
        self._event(action + '_requested')
        return True

    def action_pause(self):
        return self._request_stop('pause')

    def action_close(self):
        return self._request_stop('close')

    def action_resume(self, resume_date=False):
        self._authorize()
        self._lock()
        if self.state != 'paused' or today(self) > self.expiry_date:
            raise UserError(_('Only an unexpired paused subscription can resume.'))
        resume = fields.Date.to_date(resume_date) if resume_date else today(self)
        if not today(self) <= resume <= self.expiry_date:
            raise UserError(_('Resume must fall between today and the subscription expiry.'))
        self._save({'state': 'active' if resume == today(self) else 'confirmed', 'anchor_date': resume, 'next_billing_date': resume,
                    'pending_action': False, 'effective_date': False})
        self._event('resumed')
        return True

    def action_renew(self):
        self._authorize()
        self._lock()
        if self.state not in ('confirmed', 'active', 'paused', 'closed') or not self.snapshot.get('allow_renew'):
            raise UserError(_('This contract cannot be renewed.'))
        successor = self.sudo().search([('predecessor_id', '=', self.id)], limit=1)
        if not successor:
            start = max(today(self), self.expiry_date + timedelta(days=1))
            successor = self.sudo().create({'partner_id': self.partner_id.id, 'company_id': self.company_id.id,
                 'plan_id': self.plan_id.id, 'start_date': start,
                 'expiry_date': start + (self.expiry_date - self.start_date), 'terms': self.terms})
            successor._save({'predecessor_id': self.id})
            successor.action_quote()
            self._event('renewal_created', successor.name)
        if not staff(self.env):
            return successor.id
        return {'type': 'ir.actions.act_window', 'res_model': self._name, 'res_id': successor.id, 'view_mode': 'form'}

    def action_amend(self):
        require_admin(self.env)
        self._authorize(True)
        effective = self.next_billing_date
        if effective and effective <= today(self):
            effective = next_boundary(self.anchor_date, self.snapshot['cadence'], today(self))
        return {'type': 'ir.actions.act_window', 'res_model': 'ayal.subscription.amend', 'view_mode': 'form', 'target': 'new',
                'context': {'default_subscription_id': self.id, 'default_effective_date': effective}}

    def _stop_preview(self):
        if self.state == 'paused' or not self.next_billing_date:
            return today(self)
        effective = self.next_billing_date
        while effective <= today(self):
            effective = next_boundary(self.anchor_date, self.snapshot['cadence'], effective)
        return min(effective, self.expiry_date + timedelta(days=1))

    def action_bill(self):
        require_staff(self.env)
        for rec in self:
            rec._authorize(True)
            rec._bill_due()
        return True

    def _bill_due(self, max_periods=24):
        self._lock()
        now = today(self)
        if self.billing_error:
            self._save({'billing_error': False, 'retry_after': False})
        if self.state == 'confirmed' and self.anchor_date <= now:
            self._save({'state': 'active'})
            self._event('activated')
        if self.state != 'active':
            return
        end = self.expiry_date + timedelta(days=1)
        count = 0
        while self.next_billing_date <= now and self.next_billing_date < end and count < max_periods:
            start = self.next_billing_date
            if self.pending_action and start >= self.effective_date:
                break
            self.amendment_ids.filtered(lambda a: a.state == 'pending' and a.effective_date <= start)._apply()
            natural_end = next_boundary(self.anchor_date, self.snapshot['cadence'], start)
            period_end = min(natural_end, end)
            self.env['ayal.billing.period']._generate(self, start, period_end, (period_end - start).days / (natural_end - start).days)
            self._save({'next_billing_date': period_end})
            count += 1
        if self.pending_action and self.effective_date <= now and self.next_billing_date >= self.effective_date:
            self._save({'state': 'paused' if self.pending_action == 'pause' else 'closed',
                        'pending_action': False, 'effective_date': False})
            self._event(self.state)
        if now >= end and self.next_billing_date >= end and self.state == 'active':
            self._save({'state': 'closed' if self.snapshot['auto_close'] else 'active', 'awaiting_close': not self.snapshot['auto_close']})
            self._event('expired')
        return count

    @api.model
    def _cron_bill(self):
        domain = [('state', 'in', ['confirmed', 'active']), ('next_billing_date', '<=', fields.Date.today() + timedelta(days=1)), ('awaiting_close', '=', False), '|', ('retry_after', '=', False), ('retry_after', '<=', fields.Datetime.now())]
        started = fields.Datetime.now()
        deadline = time.monotonic() + 45
        generated = failures = 0
        # Bound work below the worker timeout; SKIP LOCKED avoids waiting on peers.
        for rec in self.search(domain, order='next_billing_date,id', limit=20):
            if time.monotonic() >= deadline:
                break
            try:
                with self.env.cr.savepoint():
                    self.env.cr.execute('SELECT id FROM ayal_subscription WHERE id=%s FOR UPDATE SKIP LOCKED', [rec.id])
                    if self.env.cr.fetchone():
                        generated += rec._bill_due() or 0
            except Exception as exc:
                failures += 1
                rec._save({'billing_error': str(exc)[:2000], 'retry_after': fields.Datetime.now() + timedelta(minutes=15)})
                import logging
                logging.getLogger(__name__).exception('Recurring billing failed for subscription %s', rec.id)
        self.env['ir.config_parameter'].sudo().set_param('ayal.billing.last_run', json.dumps({
            'started': str(started), 'completed': str(fields.Datetime.now()),
            'generated': generated, 'failures': failures}))

    @api.model
    def workspace(self, query='', state='', page=0, date_from=False, date_until=False):
        require_staff(self.env)
        domain = [('company_id', '=', self.env.company.id)]
        if query:
            domain += ['|', ('name', 'ilike', str(query)[:100]), ('partner_id.name', 'ilike', str(query)[:100])]
        if state:
            domain += [('state', '=', state)]
        page = max(0, min(int(page), 10000))
        rows = self.search(domain, limit=25, offset=page * 25)
        as_of = fields.Date.context_today(self.with_context(tz=self.env.company.partner_id.tz or 'UTC'))
        metrics = {'active': self.search_count([('state', '=', 'active'), ('expiry_date', '>=', as_of), ('company_id', '=', self.env.company.id)]),
                   'invoiced': 0, 'outstanding': 0, 'overdue': 0, 'cash': 0,
                   'failed': self.search_count([('billing_error', '!=', False), ('company_id', '=', self.env.company.id)])}
        finance = self.env.su or self.env.user.has_group('ayal_subscription.group_finance')
        if finance:
            invoice_domain = [('company_id', '=', self.env.company.id), ('state', '=', 'posted'),
                              ('move_type', 'in', ['out_invoice', 'out_refund']),
                              '|', ('ayal_period_id', '!=', False), ('reversed_entry_id.ayal_period_id', '!=', False)]
            for value, op in ((date_from, '>='), (date_until, '<=')):
                if value:
                    invoice_domain.append(('invoice_date', op, fields.Date.to_date(value)))
            sums = self.env['account.move']._read_group(invoice_domain, [], ['amount_total_signed:sum', 'amount_residual_signed:sum'])[0]
            metrics.update(invoiced=sums[0], outstanding=sums[1])
            # Installment maturity, rather than the invoice's final due date, governs overdue debt.
            line_domain = [('move_id.' + item[0], item[1], item[2]) if isinstance(item, tuple) else item
                           for item in invoice_domain]
            line_domain += [('account_id.account_type', '=', 'asset_receivable'), ('date_maturity', '<', as_of), ('amount_residual', '>', 0)]
            metrics['overdue'] = self.env['account.move.line']._read_group(line_domain, [], ['amount_residual:sum'])[0][0]
            # Cash is reconciled receipt allocation, excluding credit-note reconciliations.
            # All linked moves are checked against the current company and date filters.
            conditions, params = ["invoice.company_id=%s", "invoice.state='posted'", "invoice.ayal_period_id IS NOT NULL",
                                  "(payment.origin_payment_id IS NOT NULL OR payment.statement_line_id IS NOT NULL)"], [self.env.company.id]
            if date_from:
                conditions.append('payment.date >= %s'); params.append(fields.Date.to_date(date_from))
            if date_until:
                conditions.append('payment.date <= %s'); params.append(fields.Date.to_date(date_until))
            self.env['account.move'].flush_model()
            self.env['account.move.line'].flush_model()
            self.env['account.partial.reconcile'].flush_model()
            self.env.cr.execute("""
                SELECT COALESCE(SUM(part.amount), 0)
                FROM account_partial_reconcile part
                JOIN account_move_line debit ON debit.id=part.debit_move_id
                JOIN account_move invoice ON invoice.id=debit.move_id
                JOIN account_move_line credit ON credit.id=part.credit_move_id
                JOIN account_move payment ON payment.id=credit.move_id
                WHERE """ + ' AND '.join(conditions), params)
            metrics['cash'] = self.env.cr.fetchone()[0]
        return {'rows': [{'id': r.id, 'name': r.name, 'customer': r.partner_id.name, 'plan': r.plan_id.name,
                         'state': r.state, 'next': r.next_billing_date, 'total': r.amount_total,
                         'currency': r.currency_id.symbol} for r in rows], 'count': self.search_count(domain),
                'metrics': metrics, 'finance': finance, 'currency': self.env.company.currency_id.name}



class SubscriptionLine(models.Model):
    _name = 'ayal.subscription.line'
    _description = 'Recurring contract line'
    _order = 'id'
    _check_company_auto = True
    subscription_id = fields.Many2one('ayal.subscription', required=True, ondelete='cascade', index=True)
    company_id = fields.Many2one(related='subscription_id.company_id', store=True)
    currency_id = fields.Many2one(related='subscription_id.currency_id')
    product_id = fields.Many2one('product.product', required=True, check_company=True)
    name = fields.Char(required=True)
    quantity = fields.Integer(default=1, required=True)
    price_unit = fields.Monetary(required=True)
    tax_ids = fields.Many2many('account.tax', check_company=True)
    _positive = models.Constraint('CHECK(quantity > 0 AND price_unit >= 0)', 'Quantity must be positive and price nonnegative.')

    def _editable(self):
        require_staff(self.env)
        if any(l.subscription_id.state not in ('draft', 'quotation') for l in self):
            raise UserError(_('Accepted contract lines are immutable.'))

    @api.model_create_multi
    def create(self, vals):
        require_staff(self.env)
        for val in vals:
            val.setdefault('name', self.env['product.product'].browse(val['product_id']).display_name)
            contract = self.env['ayal.subscription'].browse(val['subscription_id'])
            contract.check_access('write')
            if contract.state not in ('draft', 'quotation'):
                raise UserError(_('Accepted contract lines are immutable.'))
        return super().create(vals)

    def write(self, vals):
        self._editable()
        if 'product_id' in vals and 'name' not in vals:
            vals = dict(vals, name=self.env['product.product'].browse(vals['product_id']).display_name)
        if 'subscription_id' in vals:
            raise UserError(_('Contract lines cannot be reassigned.'))
        return super().write(vals)

    def unlink(self):
        self._editable()
        return super().unlink()


class Event(models.Model):
    _name = 'ayal.subscription.event'
    _description = 'Subscription audit event'
    _order = 'id desc'
    subscription_id = fields.Many2one('ayal.subscription', required=True, ondelete='cascade', index=True)
    company_id = fields.Many2one(related='subscription_id.company_id', store=True)
    actor_id = fields.Many2one('res.users', required=True)
    action = fields.Char(required=True)
    detail = fields.Text()

    def write(self, vals):
        raise AccessError(_('Audit events are immutable.'))

    def unlink(self):
        raise AccessError(_('Audit events cannot be deleted.'))
