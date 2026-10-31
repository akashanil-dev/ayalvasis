import calendar
import hashlib
import json
from datetime import timedelta

from odoo import fields, _
from odoo.exceptions import AccessError, ValidationError


def admin(env):
    return env.su or env.user.has_group('ayal_subscription.group_admin')


def staff(env):
    return admin(env) or env.user.has_group('ayal_subscription.group_staff')


def require_staff(env):
    if not staff(env):
        raise AccessError('Internal subscription access is required.')


def require_admin(env):
    if not admin(env):
        raise AccessError('Only a subscription administrator may change this configuration.')


def require_finance(env):
    if not admin(env) and not env.user.has_group('ayal_subscription.group_finance'):
        raise AccessError('Billing permission is required.')


def today(record):
    timezone = record.company_id.partner_id.tz or 'UTC'
    return fields.Date.context_today(record.with_context(tz=timezone))


def boundary(anchor, cadence, index):
    if cadence == 'daily':
        return anchor + timedelta(days=index)
    if cadence == 'weekly':
        return anchor + timedelta(weeks=index)
    months = index * (12 if cadence == 'yearly' else 1)
    year, month = divmod(anchor.year * 12 + anchor.month - 1 + months, 12)
    month += 1
    return anchor.replace(year=year, month=month, day=min(anchor.day, calendar.monthrange(year, month)[1]))


def next_boundary(anchor, cadence, current):
    if cadence in ('daily', 'weekly'):
        width = 1 if cadence == 'daily' else 7
        index = (current - anchor).days // width + 1
    else:
        months = (current.year - anchor.year) * 12 + current.month - anchor.month
        index = months // (12 if cadence == 'yearly' else 1) + 1
    result = boundary(anchor, cadence, index)
    while result <= current:
        index += 1
        result = boundary(anchor, cadence, index)
    return result


def password_policy(value):
    if value and (len(value) < 9 or not any(c.isupper() for c in value)
                  or not any(c.islower() for c in value)
                  or not any(not c.isalnum() and not c.isspace() for c in value)):
        raise ValidationError('Use at least 9 characters, including uppercase, lowercase and a special character.')


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()
