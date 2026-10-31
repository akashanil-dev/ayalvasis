from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from .common import require_admin, admin, staff


class Plan(models.Model):
    _name = 'ayal.subscription.plan'
    _description = 'Subscription plan'
    _inherit = ['mail.thread']
    _check_company_auto = True
    _order = 'name'
    name = fields.Char(required=True, tracking=True)
    code = fields.Char(required=True, index=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company)
    currency_id = fields.Many2one(related='company_id.currency_id', store=True)
    product_id = fields.Many2one('product.product', required=True, check_company=True)
    cadence = fields.Selection([('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'), ('yearly', 'Yearly')], default='monthly', required=True)
    price = fields.Monetary(required=True)
    min_quantity = fields.Integer(default=1, required=True)
    available_from = fields.Date()
    available_until = fields.Date()
    auto_close = fields.Boolean(default=True)
    allow_close = fields.Boolean(default=True)
    allow_pause = fields.Boolean(default=True)
    allow_renew = fields.Boolean(default=True)
    description = fields.Text()
    auto_post = fields.Boolean(default=False, help='Automatically post recurring invoices. Requires complete accounting configuration.')
    line_ids = fields.One2many('ayal.subscription.plan.line', 'plan_id')
    _code_unique = models.Constraint('UNIQUE(company_id,code)', 'Plan code must be unique in the company.')
    _price_valid = models.Constraint('CHECK(price >= 0 AND min_quantity > 0)', 'Price must be nonnegative and minimum quantity positive.')

    @api.constrains('available_from', 'available_until')
    def _check_dates(self):
        for record in self:
            if record.available_from and record.available_until and record.available_from > record.available_until:
                raise ValidationError(_('Plan availability dates are reversed.'))

    @api.model_create_multi
    def create(self, vals):
        require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        require_admin(self.env)
        if self.env['ayal.subscription'].sudo().search_count([('plan_id', 'in', self.ids)]):
            raise ValidationError(_('Archive plans used by subscriptions instead of deleting them.'))
        return super().unlink()


class PlanLine(models.Model):
    _check_company_auto = True
    _name = 'ayal.subscription.plan.line'
    _description = 'Recurring add-on default'
    plan_id = fields.Many2one('ayal.subscription.plan', required=True, ondelete='cascade')
    company_id = fields.Many2one(related='plan_id.company_id', store=True)
    currency_id = fields.Many2one(related='plan_id.currency_id')
    product_id = fields.Many2one('product.product', required=True)
    quantity = fields.Integer(default=1, required=True)
    price_unit = fields.Monetary(required=True)
    _positive = models.Constraint('CHECK(quantity > 0 AND price_unit >= 0)', 'Quantity must be positive and price nonnegative.')

    @api.model_create_multi
    def create(self, vals):
        require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        require_admin(self.env)
        return super().unlink()


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    standard_price = fields.Float(groups='ayal_subscription.group_admin')

    @api.model_create_multi
    def create(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().write(vals)


    def unlink(self):
        if staff(self.env):
            require_admin(self.env)
        return super().unlink()


class ProductProduct(models.Model):
    _inherit = 'product.product'
    standard_price = fields.Float(groups='ayal_subscription.group_admin')

    @api.model_create_multi
    def create(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        if staff(self.env):
            require_admin(self.env)
        return super().unlink()


class Tax(models.Model):
    _inherit = 'account.tax'

    @api.model_create_multi
    def create(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        if staff(self.env):
            require_admin(self.env)
        if set(vals) & {'amount', 'amount_type', 'price_include_override', 'include_base_amount', 'children_tax_ids', 'sequence', 'is_base_affected'}:
            affected = self.sudo()
            while True:
                parents = self.sudo().search([('children_tax_ids', 'in', affected.ids)]) - affected
                if not parents:
                    break
                affected |= parents
            if self.env['ayal.subscription.line'].sudo().search_count([('tax_ids', 'in', affected.ids), ('subscription_id.state', 'not in', ['draft', 'quotation'])]):
                raise ValidationError(_('Create a new tax instead of changing a tax on an accepted contract.'))
        return super().write(vals)

    def unlink(self):
        if staff(self.env):
            require_admin(self.env)
        return super().unlink()


class QuotationTemplate(models.Model):
    _check_company_auto = True
    _name = 'ayal.subscription.template'
    _description = 'Subscription quotation template'
    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one('res.company', required=True, default=lambda s: s.env.company)
    currency_id = fields.Many2one(related='company_id.currency_id')
    plan_id = fields.Many2one('ayal.subscription.plan', required=True, check_company=True)
    validity_days = fields.Integer(default=30, required=True)
    terms = fields.Text()
    line_ids = fields.One2many('ayal.subscription.template.line', 'template_id', copy=True)
    _validity = models.Constraint('CHECK(validity_days > 0)', 'Quotation validity must be positive.')

    @api.model_create_multi
    def create(self, vals):
        require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        require_admin(self.env)
        return super().unlink()


class QuotationTemplateLine(models.Model):
    _check_company_auto = True
    _name = 'ayal.subscription.template.line'
    _description = 'Quotation template recurring product'
    template_id = fields.Many2one('ayal.subscription.template', required=True, ondelete='cascade')
    company_id = fields.Many2one(related='template_id.company_id', store=True)
    currency_id = fields.Many2one(related='template_id.currency_id')
    product_id = fields.Many2one('product.product', required=True, check_company=True)
    quantity = fields.Integer(default=1, required=True)
    price_unit = fields.Monetary(required=True)
    _positive = models.Constraint('CHECK(quantity > 0 AND price_unit >= 0)', 'Quantity must be positive and price nonnegative.')

    @api.model_create_multi
    def create(self, vals):
        require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        require_admin(self.env)
        return super().unlink()


class ProductAttribute(models.Model):
    _inherit = 'product.attribute'

    @api.model_create_multi
    def create(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        if staff(self.env):
            require_admin(self.env)
        return super().unlink()


class ProductAttributeValue(models.Model):
    _inherit = 'product.attribute.value'

    @api.model_create_multi
    def create(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        if staff(self.env):
            require_admin(self.env)
        return super().unlink()


class ProductTemplateAttributeLine(models.Model):
    _inherit = 'product.template.attribute.line'

    @api.model_create_multi
    def create(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        if staff(self.env):
            require_admin(self.env)
        return super().unlink()


class ProductTemplateAttributeValue(models.Model):
    _inherit = 'product.template.attribute.value'

    @api.model_create_multi
    def create(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().create(vals)

    def write(self, vals):
        if staff(self.env):
            require_admin(self.env)
        return super().write(vals)

    def unlink(self):
        if staff(self.env):
            require_admin(self.env)
        return super().unlink()
