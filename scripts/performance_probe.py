"""Synthetic read-load benchmark; execute ONLY in the isolated integration DB.

Clones the stored shape of a real balanced, posted, tax-free invoice using SQL.
This measures dashboard reads at volume, not invoice creation throughput. Actual
billing/accounting correctness is tested separately through the ORM.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import statistics
from threading import BoundedSemaphore
import time
from psycopg2 import sql
from odoo import api

assert env['ir.config_parameter'].sudo().get_param('ayalvasis.integration_database') == 'true'
env = env(su=True)
probe = json.loads(env['ir.config_parameter'].get_param('ayalvasis.integration_evidence'))
template = env['account.move'].browse([probe['own_invoice'], probe['other_invoice']]).filtered(lambda r: r.amount_total == 100)[0]
contract = template.ayal_period_id.subscription_id
env.flush_all()

# Temp mappings allocate real sequence IDs and keep all cloned foreign keys coherent.
env.cr.execute('CREATE TEMP TABLE perf_contract AS SELECT n, nextval(\'ayal_subscription_id_seq\')::integer AS id FROM generate_series(1,10000) n')
env.cr.execute('CREATE TEMP TABLE perf_period AS SELECT row_number() OVER ()::integer AS n, c.id AS subscription_id, m, nextval(\'ayal_billing_period_id_seq\')::integer AS id, nextval(\'account_move_id_seq\')::integer AS invoice_id FROM perf_contract c CROSS JOIN generate_series(1,10) m')

def clone(table, template_id, mapping, overrides, extra=''):
    env.cr.execute('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=%s ORDER BY ordinal_position', [table])
    columns = [row[0] for row in env.cr.fetchall()]
    expressions = [sql.SQL(overrides[c]) if c in overrides else sql.SQL('t.{}').format(sql.Identifier(c)) for c in columns]
    query = sql.SQL('INSERT INTO {} ({}) SELECT {} FROM {} t CROSS JOIN {} p WHERE t.id=%s ').format(
        sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns)), sql.SQL(',').join(expressions), sql.Identifier(table), sql.Identifier(mapping)) + sql.SQL(extra)
    env.cr.execute(query, [template_id])

clone('ayal_subscription', contract.id, 'perf_contract', {
    'id': 'p.id', 'name': "'LOAD/' || p.id", 'predecessor_id': 'NULL', 'order_id': 'NULL',
    'start_date': "(date_trunc('month',current_date)-interval '11 months')::date",
    'anchor_date': "(date_trunc('month',current_date)-interval '11 months')::date",
    'expiry_date': "current_date+365", 'next_billing_date': 'current_date+30'})
for line in contract.line_ids:
    clone('ayal_subscription_line', line.id, 'perf_contract', {'id': "nextval('ayal_subscription_line_id_seq')", 'subscription_id': 'p.id'})
clone('ayal_billing_period', template.ayal_period_id.id, 'perf_period', {
    'id': 'p.id', 'subscription_id': 'p.subscription_id', 'invoice_id': 'NULL',
    'start_date': "(date_trunc('month',current_date)-p.m*interval '1 month')::date",
    'end_date': "(date_trunc('month',current_date)-(p.m-1)*interval '1 month')::date"})
clone('account_move', template.id, 'perf_period', {
    'id': 'p.invoice_id', 'ayal_period_id': 'p.id', 'name': "'LOAD/' || p.invoice_id",
    'sequence_prefix': "'LOAD/'", 'sequence_number': 'p.invoice_id', 'access_token': 'NULL',
    'invoice_date': "(date_trunc('month',current_date)-p.m*interval '1 month')::date",
    'date': "(date_trunc('month',current_date)-p.m*interval '1 month')::date",
    'invoice_date_due': 'current_date-1'})
env.cr.execute('UPDATE ayal_billing_period b SET invoice_id=p.invoice_id FROM perf_period p WHERE b.id=p.id')
for line in template.line_ids:
    clone('account_move_line', line.id, 'perf_period', {
        'id': "nextval('account_move_line_id_seq')", 'move_id': 'p.invoice_id',
        'move_name': "'LOAD/' || p.invoice_id", 'date_maturity': 'current_date-1',
        'date': "(date_trunc('month',current_date)-p.m*interval '1 month')::date"})
# Validate balanced accounting shape and index statistics before timing.
env.cr.execute('SELECT count(*) FROM (SELECT move_id FROM account_move_line WHERE move_id IN (SELECT invoice_id FROM perf_period) GROUP BY move_id HAVING abs(sum(balance)) > 0.001) q')
assert env.cr.fetchone()[0] == 0
for table in ('ayal_subscription', 'ayal_subscription_line', 'ayal_billing_period', 'account_move', 'account_move_line'):
    env.cr.execute(sql.SQL('ANALYZE {}').format(sql.Identifier(table)))
env.cr.commit(); env.invalidate_all()
registry, uid, company_id = env.registry, env.ref('base.user_admin').id, env.company.id

slots = BoundedSemaphore(12)
def read_dashboard(_):
    start = time.perf_counter()
    with slots, registry.cursor() as cursor:
        worker = api.Environment(cursor, uid, {'allowed_company_ids': [company_id]})
        result = worker['ayal.subscription'].workspace()
        assert len(result['rows']) == 25
        assert result['metrics']['invoiced'] >= 10000000
    return time.perf_counter() - start
# Twenty simultaneous callers share twelve database slots; timings include queueing.
with ThreadPoolExecutor(max_workers=20) as pool:
    samples = list(pool.map(read_dashboard, range(20)))
ordered = sorted(samples)
print('PERFORMANCE=' + json.dumps({'subscriptions':10000, 'posted_invoices':100000, 'requests':20,
    'concurrent_callers':20, 'database_slots':12, 'p50_seconds':round(statistics.median(samples),3), 'p95_seconds':round(ordered[18],3),
    'max_seconds':round(max(samples),3), 'fixture':'synthetic cloned balanced accounting rows; dashboard reads only'}))
assert ordered[18] < 2, 'Dashboard p95 exceeded the two-second acceptance target'
