from datetime import date, timedelta
from unittest.mock import patch

from odoo import Command
from odoo.tests import tagged
from odoo.tools import mute_logger
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from ..models.common import boundary, next_boundary, password_policy


@tagged('post_install', '-at_install')
class TestSubscription(AccountTestInvoicingCommon):
    @classmethod
    def setup_independent_user(cls):
        from odoo.tests.common import new_test_user
        return new_test_user(cls.env, name='Subscription test administrator', login='ayal_test_admin',
            password='TestAccount!42', email='ayal_test_admin@example.test',
            group_ids=(cls.get_default_groups() | cls.env.ref('ayal_subscription.group_admin')).ids,
            company_id=cls.env.company.id)

    @classmethod
    def setUpClass(cls):
        # Odoo's upstream accounting fixture uses deliberately weak test passwords.
        # Scope the mock to that fixture only; application tests use the real policy.
        with patch('odoo.addons.ayal_subscription.models.identity.password_policy'):
            super().setUpClass()
        cls.env = cls.env(su=True)
        cls.product = cls.product_a.with_env(cls.env)
        cls.product.write({'taxes_id': [Command.clear()]})
        cls.plan = cls.env['ayal.subscription.plan'].create({
            'name': 'Monthly service', 'code': 'TEST-MONTH', 'product_id': cls.product.id,
            'cadence': 'monthly', 'price': 100, 'min_quantity': 1})
        cls.customer = cls.env['res.partner'].create({'name': 'Subscription customer', 'email': 'customer@ayal.test'})
        cls.staff_user = cls.env['res.users'].create({'name': 'Subscription operator', 'login': 'operator@ayal.test',
            'email': 'operator@ayal.test', 'group_ids': [Command.set([cls.env.ref('ayal_subscription.group_staff').id])]})
        cls.portal_user = cls.env['res.users'].create({'name': 'Customer', 'login': 'customer@ayal.test',
            'partner_id': cls.customer.id, 'group_ids': [Command.set([cls.env.ref('base.group_portal').id])]})

    def contract(self, start=date(2026, 1, 31), end=date(2026, 4, 29)):
        rec = self.env['ayal.subscription'].create({'partner_id': self.customer.id, 'plan_id': self.plan.id,
              'start_date': start, 'expiry_date': end, 'quote_valid_until': start + timedelta(days=30)})
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=start):
            rec.action_quote()
            rec.action_confirm()
        return rec

    def bill(self, rec, day):
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=day):
            rec._bill_due()

    def test_calendar_anchors(self):
        anchor = date(2026, 1, 31)
        self.assertEqual(boundary(anchor, 'monthly', 1), date(2026, 2, 28))
        self.assertEqual(next_boundary(anchor, 'monthly', date(2026, 2, 28)), date(2026, 3, 31))
        self.assertEqual(boundary(date(2024, 2, 29), 'yearly', 4), date(2028, 2, 29))
        self.assertEqual(boundary(anchor, 'weekly', 1), date(2026, 2, 7))

    def test_password_policy(self):
        for value in ['shortA!', 'longlowercase!', 'ALLUPPERCASE!', 'NoSpecial1234']:
            with self.assertRaises(ValidationError):
                password_policy(value)
        password_policy('SafeExample!42')

    def test_lifecycle_and_immutable_terms(self):
        rec = self.contract()
        self.assertEqual(rec.state, 'confirmed')
        self.assertEqual(rec.order_id.state, 'sale')
        with self.assertRaises(UserError):
            rec.write({'terms': 'tamper'})
        with self.assertRaises(UserError):
            rec.line_ids.write({'price_unit': 1})
        with self.assertRaises(AccessError):
            rec.write({'state': 'active'})
        with self.assertRaises(UserError):
            rec.order_id._create_invoices()

    def test_catchup_idempotency_and_proration(self):
        rec = self.contract(end=date(2026, 4, 14))
        self.bill(rec, date(2026, 4, 30))
        self.assertEqual(len(rec.period_ids), 3)
        self.assertEqual(rec.state, 'closed')
        periods = rec.period_ids.sorted('start_date')
        self.assertEqual(periods[1].end_date, date(2026, 3, 31))
        self.assertAlmostEqual(periods[2].invoice_id.amount_total, 50, places=2)
        self.bill(rec, date(2026, 5, 1))
        self.assertEqual(len(rec.period_ids), 3)

    def test_atomic_failure_keeps_cursor(self):
        rec = self.contract()
        with self.assertRaises(UserError), self.env.cr.savepoint():
            with patch.object(type(self.env['ayal.billing.period']), '_generate', side_effect=UserError('simulated accounting error')):
                self.bill(rec, date(2026, 1, 31))
        rec.invalidate_recordset()
        self.assertEqual(rec.next_billing_date, date(2026, 1, 31))
        self.assertFalse(rec.period_ids)
        self.bill(rec, date(2026, 1, 31))
        self.assertEqual(len(rec.period_ids), 1)

    def test_plan_change_does_not_reprice_contract(self):
        rec = self.contract()
        self.plan.write({'price': 500, 'cadence': 'daily', 'allow_pause': False})
        self.bill(rec, date(2026, 1, 31))
        self.assertEqual(rec.period_ids.invoice_id.amount_total, 100)
        self.assertEqual(rec.period_ids.end_date, date(2026, 2, 28))
        self.assertTrue(rec.snapshot['allow_pause'])

    def test_pause_resume_and_expiry(self):
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 2, 10)):
            rec.action_pause()
        self.assertEqual(rec.effective_date, date(2026, 2, 28))
        self.bill(rec, date(2026, 2, 28))
        self.assertEqual(rec.state, 'paused')
        self.assertEqual(len(rec.period_ids), 1)
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 3, 5)):
            rec.action_resume()
        self.assertEqual(rec.anchor_date, date(2026, 3, 5))
        self.assertEqual(rec.expiry_date, date(2026, 4, 29))
        self.bill(rec, date(2026, 3, 5))
        self.assertEqual(len(rec.period_ids), 2)

    def test_renewal_is_idempotent_and_nonoverlapping(self):
        rec = self.contract()
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 3, 5)):
            first = rec.action_renew()
            second = rec.action_renew()
        self.assertEqual(first['res_id'], second['res_id'])
        successor = self.env['ayal.subscription'].browse(first['res_id'])
        self.assertEqual(successor.start_date, rec.expiry_date + timedelta(days=1))
        self.assertEqual(successor.state, 'quotation')

    def test_discount_reserve_release_reissue_consume(self):
        rule = self.env['ayal.subscription.discount'].create({'name': 'Launch discount', 'kind': 'fixed', 'value': 20,
            'date_from': date(2026, 1, 1), 'date_until': date(2026, 12, 31), 'usage_limit': 1})
        first, second = self.contract(), self.contract()
        self.bill(first, date(2026, 1, 31))
        self.bill(second, date(2026, 1, 31))
        period = first.period_ids
        self.assertEqual(period.invoice_id.amount_total, 80)
        self.assertEqual(second.period_ids.invoice_id.amount_total, 100)
        self.assertEqual(period.reservation, 'reserved')
        period.invoice_id.button_cancel()
        self.assertEqual(period.reservation, 'released')
        period.action_reissue()
        self.assertEqual(period.reservation, 'reserved')
        period.invoice_id.action_post()
        self.assertEqual(period.reservation, 'consumed')

    def test_discount_threshold_and_expiry(self):
        self.env['ayal.subscription.discount'].create({'name': 'Not eligible', 'kind': 'percent', 'value': 50,
            'min_amount': 101, 'date_from': date(2026, 1, 1), 'date_until': date(2026, 1, 30)})
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        self.assertEqual(rec.period_ids.invoice_id.amount_total, 100)

    def test_staff_permissions(self):
        with self.assertRaises(AccessError):
            self.plan.with_user(self.staff_user).write({'price': 1})
        with self.assertRaises(AccessError):
            self.env['res.users'].with_user(self.staff_user).create({'name': 'Escalated', 'login': 'escalated@ayal.test'})
        rec = self.contract()
        with self.assertRaises(AccessError):
            rec.with_user(self.portal_user).read(['name'])
        with self.assertRaises(AccessError):
            rec.with_user(self.portal_user).action_confirm()
        self.bill(rec, date(2026, 1, 31))
        with self.assertRaises(AccessError):
            rec.period_ids.invoice_id.with_user(self.staff_user).action_post()

    def test_quotation_expiry(self):
        rec = self.env['ayal.subscription'].create({'partner_id': self.customer.id, 'plan_id': self.plan.id,
              'start_date': date(2026, 1, 31), 'expiry_date': date(2026, 4, 29), 'quote_valid_until': date(2026, 1, 30)})
        rec.action_quote()
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 1, 31)), self.assertRaises(UserError):
            rec.action_confirm()

    def test_manual_close_expired_stops_billing(self):
        self.plan.auto_close = False
        rec = self.contract()
        self.bill(rec, date(2026, 5, 31))
        self.assertTrue(rec.awaiting_close)
        self.assertEqual(len(rec.period_ids), 3)
        self.bill(rec, date(2026, 6, 30))
        self.assertEqual(len(rec.period_ids), 3)

    def test_partial_payment_and_reports(self):
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        invoice = rec.period_ids.invoice_id
        invoice.action_post()
        self._register_payment(invoice, amount=40, ayal_reference='partial-1')
        self.assertAlmostEqual(invoice.amount_residual, 60)
        metrics = self.env['ayal.subscription'].workspace()['metrics']
        self.assertAlmostEqual(metrics['invoiced'], 100)
        self.assertAlmostEqual(metrics['outstanding'], 60)
        self.assertAlmostEqual(metrics['cash'], 40)
        self._register_payment(invoice, amount=60, ayal_reference='partial-2')
        self.assertAlmostEqual(invoice.amount_residual, 0)

    def test_template_snapshot(self):
        template = self.env['ayal.subscription.template'].create({'name': 'Standard quote', 'plan_id': self.plan.id,
             'validity_days': 15, 'terms': 'Original terms', 'line_ids': [Command.create({'product_id': self.product_b.id, 'quantity': 1, 'price_unit': 20})]})
        rec = self.env['ayal.subscription'].create({'template_id': template.id, 'partner_id': self.customer.id,
            'start_date': date(2026, 1, 31), 'expiry_date': date(2026, 4, 29)})
        self.assertEqual(len(rec.line_ids), 2)
        template.terms = 'New template terms'
        self.assertEqual(rec.terms, 'Original terms')

    def test_finance_cannot_edit_generated_invoice_lines(self):
        user = self.env['res.users'].create({'name': 'Finance', 'login': 'finance@ayal.test', 'email': 'finance@ayal.test',
            'group_ids': [Command.set([self.env.ref('ayal_subscription.group_finance').id])]})
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        with self.assertRaises(UserError):
            rec.period_ids.invoice_id.invoice_line_ids.with_user(user).write({'price_unit': 1})
        rec.period_ids.invoice_id.with_user(user).action_post()

    @mute_logger('odoo.sql_db')
    def test_normalized_duplicate_email(self):
        from psycopg2 import IntegrityError
        with self.assertRaises(IntegrityError), self.env.cr.savepoint():
            self.env['res.users'].create({'name': 'Duplicate', 'login': 'another_login', 'email': ' CUSTOMER@AYAL.TEST ',
                'group_ids': [Command.set([self.env.ref('base.group_portal').id])]})

    def test_payment_duplicate_and_excess(self):
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        invoice = rec.period_ids.invoice_id
        invoice.action_post()
        wizard = self.env['account.payment.register'].with_context(active_model='account.move', active_ids=invoice.ids).create({'amount': 40, 'ayal_reference': 'bank-unique-1'})
        first = wizard._create_payments()
        second = wizard._create_payments()
        self.assertEqual(first, second)
        self.assertEqual(invoice.amount_residual, 60)
        with self.assertRaises(UserError):
            self._register_payment(invoice, amount=61, ayal_reference='excess')

    def test_direct_state_post_is_rejected(self):
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        with self.assertRaises(UserError):
            rec.period_ids.invoice_id.write({'state': 'posted'})
        rec.period_ids.invoice_id.action_post()
        with self.assertRaises(UserError):
            rec.period_ids.invoice_id.button_draft()

    def test_tax_and_discount_rounding(self):
        tax = self.env['account.tax'].create({'name': 'Acceptance VAT', 'amount': 20, 'amount_type': 'percent', 'type_tax_use': 'sale', 'tax_group_id': self.tax_sale_a.tax_group_id.id})
        self.product.taxes_id = [Command.set(tax.ids)]
        self.env['ayal.subscription.discount'].create({'name': 'Ten off', 'kind': 'fixed', 'value': 10,
            'date_from': date(2026, 1, 1), 'date_until': date(2026, 12, 31)})
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        self.assertEqual(rec.period_ids.invoice_id.amount_untaxed, 90)
        self.assertEqual(rec.period_ids.invoice_id.amount_tax, 18)
        self.assertEqual(rec.period_ids.invoice_id.amount_total, 108)
        with self.assertRaises(ValidationError):
            tax.amount = 25

    def test_availability_and_minimum_quantity(self):
        self.plan.available_until = date(2026, 1, 30)
        with self.assertRaises(UserError):
            self.contract()
        self.plan.available_until = date(2026, 12, 31)
        rec = self.env['ayal.subscription'].create({'partner_id': self.customer.id, 'plan_id': self.plan.id,
            'start_date': date(2026, 1, 31), 'expiry_date': date(2026, 4, 29)})
        self.plan.min_quantity = 2
        rec.action_quote()
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 1, 31)), self.assertRaises(UserError):
            rec.action_confirm()

    def test_auto_post_and_refund_reporting(self):
        self.plan.auto_post = True
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        invoice = rec.period_ids.invoice_id
        self.assertEqual(invoice.state, 'posted')
        refund = invoice._reverse_moves([{'date': date(2026, 2, 1)}], cancel=False)
        refund.action_post()
        self.assertEqual(self.env['ayal.subscription'].workspace()['metrics']['invoiced'], 0)

    def test_fixed_discount_allocation(self):
        self.env['ayal.subscription.discount'].create({'name': 'One cent', 'kind': 'fixed', 'value': .01,
            'date_from': date(2026, 1, 1), 'date_until': date(2026, 12, 31)})
        rec = self.env['ayal.subscription'].create({'partner_id': self.customer.id, 'plan_id': self.plan.id,
            'start_date': date(2026, 1, 31), 'expiry_date': date(2026, 4, 29),
            'line_ids': [Command.create({'product_id': self.product.id, 'quantity': 1, 'price_unit': 100}) for _ in range(3)]})
        rec.action_quote()
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 1, 31)):
            rec.action_confirm()
        self.bill(rec, date(2026, 1, 31))
        self.assertAlmostEqual(rec.period_ids.invoice_id.amount_total, 299.99)

    def test_staff_provisioning_is_limited(self):
        wizard = self.env['ayal.staff.invite'].create({'name': 'New operator', 'email': 'newoperator@ayal.test'})
        wizard.action_create()
        user = self.env['res.users'].search([('login', '=', 'newoperator@ayal.test')])
        self.assertTrue(user.has_group('ayal_subscription.group_staff'))
        self.assertFalse(user.has_group('base.group_system'))
        self.assertFalse(user.has_group('ayal_subscription.group_admin'))
        with self.assertRaises(AccessError):
            wizard.with_user(self.staff_user).action_create()

    def test_scheduled_quantity_preserves_prior_revision(self):
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        original = rec.snapshot_hash
        with patch('odoo.addons.ayal_subscription.models.amendments.today', return_value=date(2026, 2, 1)):
            self.env['ayal.subscription.amend'].create({'subscription_id': rec.id, 'line_id': rec.line_ids.id,
                'quantity': 2, 'effective_date': date(2026, 2, 28), 'reason': 'Customer requested two seats'}).action_schedule()
        self.bill(rec, date(2026, 2, 28))
        self.assertEqual(rec.period_ids.sorted('start_date')[0].invoice_id.amount_total, 100)
        self.assertEqual(rec.period_ids.sorted('start_date')[1].invoice_id.amount_total, 200)
        self.assertEqual(rec.amendment_ids.before_snapshot['lines'][0]['quantity'], 1)
        self.assertEqual(rec.amendment_ids.after_snapshot['lines'][0]['quantity'], 2)
        self.assertNotEqual(rec.snapshot_hash, original)

    def test_payment_terms_snapshot(self):
        self.customer.property_payment_term_id = self.pay_terms_b
        rec = self.contract()
        self.assertNotEqual(rec.accepted_payment_term_id, self.pay_terms_b)
        original_days = rec.accepted_payment_term_id.line_ids[-1].nb_days
        self.pay_terms_b.line_ids[-1].nb_days = 10
        self.assertEqual(rec.accepted_payment_term_id.line_ids[-1].nb_days, original_days)
        with self.assertRaises(UserError):
            rec.accepted_payment_term_id.line_ids[-1].nb_days = 99
        self.bill(rec, date(2026, 1, 31))
        self.assertEqual(rec.period_ids.invoice_id.invoice_payment_term_id, rec.accepted_payment_term_id)

    def test_resume_future_stays_confirmed_until_anchor(self):
        rec = self.contract()
        self.bill(rec, date(2026, 1, 31))
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 2, 1)):
            rec.action_pause()
        self.bill(rec, date(2026, 2, 28))
        with patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 3, 1)):
            rec.action_resume('2026-03-10')
        self.assertEqual(rec.state, 'confirmed')
        self.bill(rec, date(2026, 3, 9))
        self.assertEqual(len(rec.period_ids), 1)
        self.bill(rec, date(2026, 3, 10))
        self.assertEqual(rec.state, 'active')
        self.assertEqual(len(rec.period_ids), 2)

    def test_variant_surcharge_applies_once(self):
        attribute = self.env['product.attribute'].create({'name': 'Subscription tier', 'value_ids': [Command.create({'name': 'Premium'}), Command.create({'name': 'Basic'})]})
        template = self.env['product.template'].create({'name': 'Variant service', 'type': 'service', 'list_price': 9999,
            'taxes_id': [Command.clear()], 'property_account_income_id': self.company_data['default_account_revenue'].id,
            'attribute_line_ids': [Command.create({'attribute_id': attribute.id, 'value_ids': [Command.set(attribute.value_ids.ids)]})]})
        premium = template.attribute_line_ids.product_template_value_ids.filtered(lambda v: v.name == 'Premium')
        premium.price_extra = 560
        variant = template.product_variant_ids.filtered(lambda p: premium in p.product_template_attribute_value_ids)
        self.plan.product_id = variant
        rec = self.contract()
        self.assertEqual(rec.amount_total, 660)
        self.bill(rec, date(2026, 1, 31))
        self.assertEqual(rec.period_ids.invoice_id.amount_total, 660)
        with self.assertRaises(AccessError):
            premium.with_user(self.staff_user).price_extra = 1

    def test_other_company_plan_is_inaccessible(self):
        other = self.env['res.company'].create({'name': 'Subscription isolation company'})
        plan = self.env['ayal.subscription.plan'].with_company(other).create({'name': 'Other plan', 'code': 'OTHER', 'product_id': self.product.id, 'price': 100})
        with self.assertRaises(AccessError):
            plan.with_user(self.staff_user).with_context(allowed_company_ids=[self.env.company.id]).read(['name'])

    def test_agreement_report_renders(self):
        rec = self.contract()
        html, _ = self.env['ir.actions.report']._render_qweb_html('ayal_subscription.action_report_contract', rec.ids)
        self.assertIn(rec.name.encode(), html)

    def test_reset_tokens_expire_and_cannot_replay(self):
        partner = self.portal_user.partner_id
        partner.signup_prepare(signup_type='reset')
        expired = partner._generate_signup_token(expiration=-1)
        self.assertFalse(partner._get_partner_from_token(expired))
        token = partner._generate_signup_token()
        self.env['res.users'].signup({'password': 'ResetPassword!42'}, token)
        self.assertFalse(partner._get_partner_from_token(token))
        with self.assertRaises(UserError):
            self.env['res.users'].signup({'password': 'ReplayPassword!42'}, token)

    def test_auth_request_limit(self):
        limiter = self.env['ayal.auth.throttle']
        self.assertTrue(all(limiter._allow('fixture-reset') for _ in range(10)))
        self.assertFalse(limiter._allow('fixture-reset'))

    @mute_logger('odoo.addons.ayal_subscription.models.subscription')
    def test_cron_failure_isolation_and_retry_delay(self):
        broken, healthy = self.contract(), self.contract()
        model = type(self.env['ayal.billing.period'])
        generate = model._generate
        def failing(engine, subscription, *args):
            if subscription == broken:
                raise UserError('Fixture accounting error')
            return generate(engine, subscription, *args)
        with patch.object(model, '_generate', failing), patch('odoo.addons.ayal_subscription.models.subscription.today', return_value=date(2026, 1, 31)):
            self.env['ayal.subscription']._cron_bill()
        self.assertFalse(broken.period_ids)
        self.assertEqual(broken.next_billing_date, date(2026, 1, 31))
        self.assertTrue(broken.billing_error)
        self.assertTrue(broken.retry_after)
        self.assertEqual(len(healthy.period_ids), 1)
        self.assertTrue(self.env['ir.config_parameter'].get_param('ayal.billing.last_run'))

    def test_grouped_tax_and_product_description_are_frozen(self):
        child = self.env['account.tax'].create({'name': 'Grouped rate', 'amount': 10, 'type_tax_use': 'sale', 'tax_group_id': self.tax_sale_a.tax_group_id.id})
        group = self.env['account.tax'].create({'name': 'Grouped tax', 'amount_type': 'group', 'type_tax_use': 'sale', 'tax_group_id': self.tax_sale_a.tax_group_id.id, 'children_tax_ids': [Command.set(child.ids)]})
        self.product.taxes_id = [Command.set(group.ids)]
        rec = self.contract()
        original_name = rec.line_ids.name
        self.product.name = 'Renamed after acceptance'
        with self.assertRaises(ValidationError):
            child.amount = 50
        self.bill(rec, date(2026, 1, 31))
        self.assertIn(original_name, rec.period_ids.invoice_id.invoice_line_ids.name)
        self.assertEqual(rec.period_ids.invoice_id.amount_total, 110)
