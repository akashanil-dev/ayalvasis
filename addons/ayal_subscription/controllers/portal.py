import hashlib
from odoo import http, fields
from odoo.http import request
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.addons.auth_signup.controllers.main import AuthSignupHome
from werkzeug.exceptions import NotFound, TooManyRequests


class Portal(CustomerPortal):
    def _prepare_home_portal_values(self, counters):
        values = super()._prepare_home_portal_values(counters)
        if 'subscription_count' in counters:
            values['subscription_count'] = request.env['ayal.subscription'].sudo().search_count(self._domain())
        return values

    def _domain(self):
        return [('partner_id', '=', request.env.user.partner_id.id), ('company_id', '=', request.env.company.id)]

    def _owned(self, record_id):
        record = request.env['ayal.subscription'].sudo().search(self._domain() + [('id', '=', record_id)], limit=1)
        if not record:
            raise NotFound()
        return record

    @http.route('/my/subscriptions', type='http', auth='user', website=True, methods=['GET'])
    def subscriptions(self, **kw):
        return request.render('ayal_subscription.portal_subscriptions', {})

    @http.route('/my/subscriptions/data', type='http', auth='user', methods=['GET'])
    def data(self, page=0, **kw):
        try:
            page = max(0, min(int(page), 10000))
        except (TypeError, ValueError):
            page = 0
        model = request.env['ayal.subscription'].sudo()
        count = model.search_count(self._domain())
        page = min(page, max(0, (count - 1) // 12))
        records = model.search(self._domain(), limit=12, offset=page * 12)
        rows = []
        for rec in records:
            invoices = request.env['account.move'].sudo().search([('state', '=', 'posted'), '|', ('ayal_period_id.subscription_id', '=', rec.id), ('reversed_entry_id.ayal_period_id.subscription_id', '=', rec.id)], limit=12, order='invoice_date desc,id desc')
            rows.append({'id': rec.id, 'name': rec.name, 'plan': rec.snapshot.get('plan_name', rec.plan_id.name) if rec.snapshot else rec.plan_id.name, 'state': rec.state,
                         'start': rec.start_date, 'expiry': rec.expiry_date,
                         'next': rec.next_billing_date if rec.state in ('confirmed', 'active') else False,
                         'total': rec.amount_total, 'currency': rec.currency_id.symbol, 'currency_code': rec.currency_id.name, 'terms': rec.terms or '',
                         'lines': [{'product': l.name, 'quantity': l.quantity, 'price': l.price_unit, 'taxes': ', '.join(l.tax_ids.mapped('name'))} for l in rec.line_ids],
                         'today': fields.Date.context_today(rec.with_context(tz=rec.company_id.partner_id.tz or 'UTC')),
                         'change_effective': rec._stop_preview(), 'pending': rec.pending_action, 'effective': rec.effective_date,
                         'can_pause': bool(rec.snapshot and rec.snapshot.get('allow_pause')),
                         'can_close': bool(rec.snapshot and rec.snapshot.get('allow_close')),
                         'can_renew': bool(rec.snapshot and rec.snapshot.get('allow_renew')),
                         'invoices': [{'id': m.id, 'name': m.name, 'total': m.amount_total,
                                       'due': m.amount_residual, 'status': m.payment_state,
                                       'url': '/my/subscriptions/%s/invoice/%s' % (rec.id, m.id)} for m in invoices]})
        return request.make_json_response({'rows': rows, 'count': count, 'page': page, 'tour_identity': f'{request.env.cr.dbname}:{request.env.uid}', 'csrf': request.csrf_token()}, headers=[('Cache-Control', 'no-store')])

    @http.route('/my/subscriptions/<int:record_id>/<string:action>', type='http', auth='user', methods=['POST'], csrf=True)
    def change(self, record_id, action, **kw):
        record = self._owned(record_id)
        methods = {'accept': 'action_confirm', 'pause': 'action_pause', 'close': 'action_close', 'resume': 'action_resume', 'renew': 'action_renew'}
        if action not in methods:
            raise NotFound()
        try:
            # Ownership checked above; sudo only exposes this explicit action whitelist.
            with request.env.cr.savepoint():
                if action == 'resume':
                    record.action_resume(resume_date=kw.get('resume_date'))
                else:
                    getattr(record, methods[action])()
        except (UserError, ValidationError, AccessError, ValueError) as exc:
            return request.make_json_response({'error': str(exc)}, status=400)
        return request.make_json_response({'ok': True})

    @http.route('/my/subscriptions/<int:record_id>/agreement', type='http', auth='user', methods=['GET'])
    def agreement(self, record_id, **kw):
        record = self._owned(record_id)
        pdf, _ = request.env['ir.actions.report'].sudo()._render_qweb_pdf('ayal_subscription.action_report_contract', res_ids=record.ids)
        return request.make_response(pdf, [('Content-Type', 'application/pdf'), ('Content-Disposition', 'attachment; filename="agreement-%s.pdf"' % record.id)])

    @http.route('/my/subscriptions/<int:record_id>/invoice/<int:invoice_id>', type='http', auth='user', methods=['GET'])
    def invoice(self, record_id, invoice_id, **kw):
        record = self._owned(record_id)
        invoice = request.env['account.move'].sudo().search([('id', '=', invoice_id), ('state', '=', 'posted'), '|', ('ayal_period_id.subscription_id', '=', record.id), ('reversed_entry_id.ayal_period_id.subscription_id', '=', record.id)], limit=1)
        if not invoice:
            raise NotFound()
        pdf, _ = request.env['ir.actions.report'].sudo()._render_qweb_pdf('account.account_invoices', res_ids=invoice.ids)
        return request.make_response(pdf, [('Content-Type', 'application/pdf'), ('Content-Disposition', 'attachment; filename="invoice-%s.pdf"' % invoice.id)])


class Signup(AuthSignupHome):
    def _prepare_signup_values(self, qcontext):
        from odoo.tools import email_normalize
        values = super()._prepare_signup_values(qcontext)
        email = email_normalize(values.get('login', ''))
        if not email:
            raise ValidationError('Enter a valid email address.')
        values['login'] = email.strip().casefold()
        return values

    def _limit(self, scope):
        if request.httprequest.method == 'POST':
            key = hashlib.sha256((scope + ':' + (request.httprequest.remote_addr or '')).encode()).hexdigest()
            if not request.env['ayal.auth.throttle'].sudo()._allow(key):
                raise TooManyRequests('Please try again later.')

    @http.route()
    def web_auth_signup(self, *args, **kw):
        self._limit('signup')
        return super().web_auth_signup(*args, **kw)

    @http.route()
    def web_auth_reset_password(self, *args, **kw):
        self._limit('reset')
        if request.httprequest.method == 'POST' and not request.params.get('token'):
            context = self.get_auth_signup_qcontext()
            if not context.get('reset_password_enabled'):
                raise NotFound()
            try:
                with request.env.cr.savepoint():
                    request.env['res.users'].sudo().reset_password(request.params.get('login', ''))
            except Exception:
                import logging
                logging.getLogger(__name__).warning('Password-reset delivery could not be completed')
            context['message'] = 'If an account matches this email, password reset instructions have been sent.'
            context.pop('error', None)
            response = request.render('auth_signup.reset_password', context)
            response.headers['Cache-Control'] = 'no-store'
            response.headers['X-Frame-Options'] = 'SAMEORIGIN'
            return response
        return super().web_auth_reset_password(*args, **kw)
