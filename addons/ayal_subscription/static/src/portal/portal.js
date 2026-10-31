/** @odoo-module **/
import { Component, onMounted, onWillUnmount, useEffect, useRef, useState } from '@odoo/owl';
import { registry } from '@web/core/registry';

export class SubscriptionPortal extends Component {
    static template = 'ayal_subscription.Portal';
    static props = ['*'];
    setup() {
        this.state = useState({ rows: [], count: 0, page: 0, loading: true, busy: false, error: '', errorSource: '', expired: false, notice: '', confirm: null });
        this.csrf = '';
        this.generation = 0;
        this.abort = new AbortController();
        this.confirmation = useRef('confirmation');
        // Render the loading state before waiting for the first request.
        onMounted(() => this.load());
        onWillUnmount(() => { this.generation++; this.abort.abort(); });
        useEffect(() => {
            if (this.confirmation.el) {
                this.confirmation.el.focus();
                this.confirmation.el.scrollIntoView({ block: 'nearest' });
            }
        }, () => [this.state.confirm?.id, this.state.confirm?.action]);
    }
    async load() {
        const generation = ++this.generation;
        this.state.loading = true;
        this.state.error = '';
        this.state.errorSource = '';
        this.state.expired = false;
        try {
            const response = await fetch('/my/subscriptions/data?page=' + this.state.page, { credentials: 'same-origin', signal: this.abort.signal });
            if (generation !== this.generation) return;
            this.state.expired = response.status === 401 || response.status === 403 ||
                (response.ok && !response.headers.get('content-type')?.includes('application/json'));
            if (this.state.expired) throw new Error('Your session may have expired. Sign in again to continue.');
            if (!response.ok) throw new Error('Subscriptions are temporarily unavailable. Please retry.');
            const data = await response.json();
            if (generation !== this.generation) return;
            this.csrf = data.csrf;
            this.state.rows = data.rows;
            this.state.count = data.count;
            this.state.page = data.page;
        } catch (error) {
            if (generation === this.generation && error.name !== 'AbortError') {
                this.state.error = error instanceof TypeError ? 'Unable to connect. Check your connection and retry.' : error.message;
                this.state.errorSource = 'load';
            }
        } finally { if (generation === this.generation) this.state.loading = false; }
    }
    page(delta) {
        if (this.state.loading || this.state.busy) return;
        this.state.page = Math.max(0, Math.min(this.state.page + delta, Math.max(0, Math.ceil(this.state.count / 12) - 1)));
        this.state.notice = '';
        this.state.confirm = null;
        return this.load();
    }
    ask(row, action) {
        if (this.state.loading || this.state.busy || this.state.expired) return;
        this.state.error = '';
        this.state.notice = '';
        this.state.confirm = { id: row.id, name: row.name, action, effective: row.change_effective, today: row.today, expiry: row.expiry, resume_date: row.today };
    }
    cancel() {
        if (!this.state.busy) {
            this.state.confirm = null;
            if (!this.state.expired) this.state.error = '';
        }
    }
    money(amount, row) {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: row.currency_code }).format(amount);
    }
    paymentStatus(value) {
        return { not_paid: 'Unpaid', partial: 'Partially paid', in_payment: 'Payment processing', paid: 'Paid', reversed: 'Reversed', blocked: 'Blocked' }[value] || value;
    }
    async execute() {
        const pending = this.state.confirm;
        if (!pending || this.state.busy) return;
        this.state.busy = true;
        this.state.error = '';
        this.state.notice = '';
        this.state.errorSource = '';
        this.state.expired = false;
        try {
            if (pending.action === 'resume' && (!pending.resume_date || pending.resume_date < pending.today || pending.resume_date > pending.expiry)) {
                throw new Error('Choose a resume date between today and the subscription expiry.');
            }
            const body = new URLSearchParams({ csrf_token: this.csrf });
            if (pending.action === 'resume') body.set('resume_date', pending.resume_date);
            const response = await fetch(`/my/subscriptions/${pending.id}/${pending.action}`, { method: 'POST', credentials: 'same-origin', body, signal: this.abort?.signal });
            if (!response.headers.get('content-type')?.includes('application/json')) {
                this.state.expired = response.ok || [400, 401, 403].includes(response.status);
                throw new Error(this.state.expired ? 'Your session expired. Sign in again before retrying.' : 'Unable to complete this request. Please try again.');
            }
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to complete this request.');
            this.state.confirm = null;
            this.state.notice = 'Your request has been saved.';
            await this.load();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.state.error = error instanceof TypeError ? 'Connection interrupted. Refresh subscriptions to check whether the request was saved before retrying.' : error.message;
                this.state.errorSource = 'action';
            }
        } finally { this.state.busy = false; }
    }
}
registry.category('public_components').add('ayal_subscription.Portal', SubscriptionPortal);
