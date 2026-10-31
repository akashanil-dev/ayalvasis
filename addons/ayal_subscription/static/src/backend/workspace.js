/** @odoo-module **/
import { Component, onWillStart, onWillUnmount, useState } from '@odoo/owl';
import { registry } from '@web/core/registry';
import { useService } from '@web/core/utils/hooks';

export class Workspace extends Component {
    static template = 'ayal_subscription.Workspace';
    static props = ['*'];
    setup() {
        this.orm = useService('orm');
        this.action = useService('action');
        this.state = useState({ rows: [], metrics: {}, count: 0, page: 0, query: '', filter: '', dateFrom: '', dateUntil: '', finance: false, currency: '', loading: true, error: '' });
        this.generation = 0;
        onWillStart(() => this.load());
        onWillUnmount(() => { this.generation++; });
    }
    async load() {
        const generation = ++this.generation;
        this.state.loading = true;
        this.state.error = '';
        try {
            const result = await this.orm.call('ayal.subscription', 'workspace', [], {
                query: this.state.query, state: this.state.filter, page: this.state.page, date_from: this.state.dateFrom || false, date_until: this.state.dateUntil || false,
            });
            if (generation === this.generation) Object.assign(this.state, result);
        } catch (error) {
            if (generation === this.generation) this.state.error = error.data?.message || error.message || 'Unable to load subscriptions.';
        } finally {
            if (generation === this.generation) this.state.loading = false;
        }
    }
    search() { this.state.page = 0; return this.load(); }
    page(delta) { this.state.page += delta; return this.load(); }
    open(id) { return this.action.doAction({ type: 'ir.actions.act_window', res_model: 'ayal.subscription', res_id: id, views: [[false, 'form']] }); }
    create() { return this.open(false); }
    billing() { return this.action.doAction('ayal_subscription.periods_action'); }
}
registry.category('actions').add('ayal_subscription.workspace', Workspace);
