/** @odoo-module **/
import { Component, onWillStart, onWillUnmount, useState } from '@odoo/owl';
import { registry } from '@web/core/registry';

export class SubscriptionPortal extends Component {
    static template = 'ayal_subscription.Portal';
    static props = ['*'];
    setup() {
        this.state = useState({ rows: [], count: 0, page: 0, loading: true, busy: false, error: '', notice: '', confirm: null });
        this.csrf = '';
        this.abort = new AbortController();
        onWillStart(() => this.load());
        onWillUnmount(() => this.abort.abort());
    }
    async load() {
        this.state.loading = true;
        this.state.error = '';
        try {
            const response = await fetch('/my/subscriptions/data?page=' + this.state.page, { credentials: 'same-origin', signal: this.abort.signal });
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Your session may have expired. Sign in again and retry.');
            const data = await response.json();
            this.csrf = data.csrf;
            this.state.rows = data.rows;
            this.state.count = data.count;
        } catch (error) { if (error.name !== 'AbortError') this.state.error = error.message; }
        finally { this.state.loading = false; }
    }
    page(delta) { this.state.page += delta; return this.load(); }
    ask(row, action) { this.state.confirm = { id: row.id, name: row.name, action, effective: row.change_effective, today: row.today, expiry: row.expiry, resume_date: row.today }; }
    cancel() { this.state.confirm = null; }
    async execute() {
        const pending = this.state.confirm;
        if (!pending || this.state.busy) return;
        this.state.busy = true;
        this.state.error = '';
        try {
            const body = new URLSearchParams({ csrf_token: this.csrf });
            if (pending.action === 'resume') body.set('resume_date', pending.resume_date);
            const response = await fetch(`/my/subscriptions/${pending.id}/${pending.action}`, { method: 'POST', credentials: 'same-origin', body });
            if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Your session expired. Refresh the page and sign in.');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to complete this request.');
            this.state.confirm = null;
            this.state.notice = 'Your request has been saved.';
            await this.load();
        } catch (error) { if (error.name !== 'AbortError') this.state.error = error.message; }
        finally { this.state.busy = false; }
    }
}
registry.category('public_components').add('ayal_subscription.Portal', SubscriptionPortal);
