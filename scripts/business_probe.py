"""Executed through Odoo shell, exclusively in a disposable smoke database.

Uses independent transactions for contention tests. No test-runner savepoint or
mock can hide PostgreSQL serialization behavior here.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import json
from threading import Barrier
import time

import psycopg2
from odoo import api, fields, SUPERUSER_ID, Command

if not env.cr.dbname.startswith('ayalvasis'):
    raise RuntimeError('Unexpected integration database name')
assert env['ir.config_parameter'].sudo().get_param('ayalvasis.integration_database') == 'true', 'Disposable database marker required'
env = env(su=True)
company = env.company
if not company.chart_template:
    env['account.chart.template'].try_loading('generic_coa', company=company, install_demo=False)
# The generic chart is a test fixture, not a production accounting configuration.
company.partner_id.tz = 'Asia/Kolkata'
receivable = env['account.account'].search([('account_type', '=', 'asset_receivable'), ('company_ids', 'in', company.ids)], limit=1)
payable = env['account.account'].search([('account_type', '=', 'liability_payable'), ('company_ids', 'in', company.ids)], limit=1)
income = env['account.account'].search([('account_type', '=', 'income'), ('company_ids', 'in', company.ids)], limit=1)
assert receivable and payable and income
partner = env['res.partner'].create({'name': 'Smoke Customer A', 'email': 'smoke.a@example.test',
    'property_account_receivable_id': receivable.id, 'property_account_payable_id': payable.id})
other = partner.copy({'name': 'Smoke Customer B', 'email': 'smoke.b@example.test'})
for login, contact in [('smoke.a@example.test', partner), ('smoke.b@example.test', other)]:
    env['res.users'].create({'name': contact.name, 'login': login, 'partner_id': contact.id,
        'password': 'SmokeCustomer!42', 'group_ids': [Command.set([env.ref('base.group_portal').id])]})
product = env['product.product'].create({'name': 'Integration recurring service', 'type': 'service',
    'list_price': 100, 'property_account_income_id': income.id, 'taxes_id': [Command.clear()]})
plan = env['ayal.subscription.plan'].create({'name': 'Integration monthly', 'code': 'INTEGRATION',
    'product_id': product.id, 'price': 100})
now = fields.Date.context_today(env['ayal.subscription'].with_context(tz='Asia/Kolkata'))
def make_contract(customer):
    rec = env['ayal.subscription'].create({'partner_id': customer.id, 'plan_id': plan.id,
        'start_date': now, 'expiry_date': now + timedelta(days=90)})
    rec.action_quote()
    rec.action_confirm()
    return rec
first, second, third = make_contract(partner), make_contract(partner), make_contract(other)
discount = env['ayal.subscription.discount'].create({'name': 'One concurrent use', 'kind': 'fixed', 'value': 10,
    'usage_limit': 1, 'date_from': now, 'date_until': now + timedelta(days=30)})
env.cr.commit()
registry = env.registry

# The same normalized email must have only one winner across independent signups.
signup_gate = Barrier(2)
def signup_worker(index):
    try:
        with registry.cursor() as cursor:
            user_env = api.Environment(cursor, SUPERUSER_ID, {'no_reset_password': True})
            signup_gate.wait(timeout=20)
            user_env['res.users'].create({'name': 'Concurrent signup', 'login': 'signup-race-' + str(index),
                'email': 'Race@Example.Test' if index == 0 else ' race@example.test ',
                'group_ids': [Command.set([user_env.ref('base.group_portal').id])]})
            cursor.commit()
            return 'created'
    except psycopg2.IntegrityError:
        return 'duplicate'
with ThreadPoolExecutor(max_workers=2) as pool:
    assert sorted(pool.map(signup_worker, [0, 1])) == ['created', 'duplicate']
env.cr.rollback(); env.invalidate_all()
assert env['res.users'].search_count([('ayal_email_key', '=', 'race@example.test')]) == 1

def race(ids):
    gate = Barrier(len(ids))
    def worker(record_id):
        for attempt in range(6):
            try:
                with registry.cursor() as cursor:
                    worker_env = api.Environment(cursor, SUPERUSER_ID, {})
                    if attempt == 0:
                        # Establish both snapshots before either worker takes a lock.
                        worker_env['ayal.subscription'].browse(record_id).read(['state'])
                        gate.wait(timeout=20)
                    worker_env['ayal.subscription'].browse(record_id)._bill_due()
                    cursor.commit()
                    return attempt
            except (psycopg2.errors.SerializationFailure, psycopg2.errors.DeadlockDetected):
                time.sleep(.05 * (attempt + 1))
        raise AssertionError('Serialization retries exhausted')
    with ThreadPoolExecutor(max_workers=len(ids)) as pool:
        return list(pool.map(worker, ids))
retries = race([first.id, first.id])
env.cr.rollback(); env.invalidate_all()
assert len(first.period_ids) == 1, 'Concurrent workers duplicated a period'
# Restore the discount slot to test contention across distinct contracts.
first.period_ids.invoice_id.button_cancel()
env.cr.commit()
race([second.id, third.id])
env.cr.rollback(); env.invalidate_all()
assert env['ayal.billing.period'].search_count([('discount_id', '=', discount.id), ('reservation', '=', 'reserved')]) == 1, 'Global discount limit exceeded'
assert len(second.period_ids) == len(third.period_ids) == 1
for rec in (second, third):
    rec.period_ids.invoice_id.action_post()
quote = env['ayal.subscription'].create({'partner_id': partner.id, 'plan_id': plan.id,
    'start_date': now, 'expiry_date': now + timedelta(days=30)})
quote.action_quote()
attachment = env['ir.attachment'].create({'name': 'Business restore evidence.txt', 'res_model': 'ayal.subscription',
    'res_id': second.id, 'raw': b'Subscription business restore verified'})
params = {'own_id': second.id, 'other_id': third.id, 'quote_id': quote.id,
          'own_invoice': second.period_ids.invoice_id.id, 'other_invoice': third.period_ids.invoice_id.id,
          'attachment_id': attachment.id, 'period_count': env['ayal.billing.period'].search_count([])}
env['ir.config_parameter'].set_param('ayalvasis.integration_evidence', json.dumps(params))
env['ir.config_parameter'].set_param('auth_signup.invitation_scope', 'b2c')
env['ir.config_parameter'].set_param('auth_signup.reset_password', 'True')
env.cr.commit()
print('BUSINESS_PROBE=' + json.dumps(params))
print('PASS: concurrent normalized-email signup, simultaneous billing, serialization retries, last-use discount contention, real posted invoices and filestore attachment')
