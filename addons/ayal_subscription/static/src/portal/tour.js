/** @odoo-module **/
import { Component, onMounted, onWillUnmount, useEffect, useRef, useState } from '@odoo/owl';

const customerSteps = [
    ['Your customer account', 'This is your subscription portal. You can review your own agreements and invoices. To get started, contact our team for a quotation; signing up does not purchase a subscription.', '.ayal-portal h1', 'My subscriptions'],
    ['Review a quotation', 'Open Products and pricing, Contract terms and Download agreement on a subscription card. Check the recurring price, taxes and service dates before accepting.', '.ayal-portal article', 'My subscriptions → subscription card'],
    ['Accept and get activated', 'Choose Accept quotation, review the confirmation, then Confirm request. Our team activates the accepted subscription. The tour never accepts or changes anything for you.', '.ayal-portal article', 'Quotation card → Accept quotation'],
    ['Understand your service', 'Each card shows the status, service dates and next billing date. A scheduled pause or closure is displayed with its effective date. Use Previous and Next when you have more subscriptions.', '.ayal-portal-grid', 'My subscriptions → service dates'],
    ['Invoices and payments', 'Latest invoices shows posted invoices, payment status and the remaining amount due. Open an invoice to download its PDF, or use All invoices and credit notes. Contact our team to record a manual payment; this portal does not take card payments.', '.ayal-portal a[href="/my/invoices"]', 'My subscriptions → All invoices and credit notes'],
    ['Pause, resume, close or renew', 'Available buttons depend on your plan and subscription status. Pause and Close take effect at a billing boundary; existing invoices remain payable. Resume needs a valid date. Renew creates a new quotation to review. Read each confirmation before proceeding.', '.ayal-portal article', 'Subscription card → available actions'],
    ['Account help and recovery', 'If your session expires, sign in again. Use Reset password on the login page if needed; email delivery must be configured by the administrator. For an interrupted action, refresh subscriptions to check the result before retrying.', '.ayal-portal h1', 'Login → Reset password'],
    ['You are ready', 'No subscriptions yet? Ask our team for a quotation using the email address on your account. You can replay this guide with Take a tour. Skip tour closes it at any time.', '.ayal-portal h1', 'My subscriptions → Take a tour'],
];
const operationsSteps = [
    ['Your subscription workspace', 'Use this workspace to find customer subscriptions and manage their lifecycle. This guide follows your role; it does not create records or perform actions.', '.ayal-workspace h1', 'Subscriptions → Workspace'],
    ['Find the right customer', 'Search by customer or subscription and filter by status. Clear filters resets the search. Previous and Next move through results; open a subscription number to inspect its agreement.', '#ayal-search', 'Workspace → Search subscriptions'],
    ['Prepare a subscription', 'Choose New subscription. Select the correct customer, a configured plan or quotation template, service dates and quantities. Review product lines, taxes and terms, then save the draft. Ask an administrator if configuration is missing.', '.ayal-workspace header', 'Workspace → New subscription'],
    ['Send a quotation for acceptance', 'Open the draft in Contracts and choose Create quotation. Check its validity and agreement before sharing it with the customer. Email sending requires configured mail delivery. The customer can review and accept through My subscriptions.', '.ayal-workspace header', 'Subscriptions → Contracts → Create quotation'],
    ['Activate accepted service', 'Check that the customer accepted the quotation, then Activate the confirmed subscription. Review start, expiry and next billing dates. Do not change workflow state directly.', '.ayal-workspace [aria-label="Subscription results"]', 'Contracts → confirmed subscription → Activate'],
    ['Generate and monitor billing periods', 'On an active subscription, Generate due invoices creates due billing periods. Billing history shows these periods and linked invoices. Finance users review and post invoices. If a billing error is reported, inspect its cause before retrying; check existing periods first.', '.ayal-workspace header', 'Workspace → Billing history'],
    ['Manage lifecycle requests', 'Open a contract to review its allowed pause, resume, close and renewal actions. Plan rules and current state control availability. Explain effective dates to the customer; existing invoices still need settlement.', '.ayal-workspace [aria-label="Subscription results"]', 'Subscriptions → Contracts'],
];
const financeSteps = [
    ['Generate and post invoices', 'On an active subscription, Generate due invoices creates the due billing periods. Review the linked draft invoice, taxes and dates; Confirm posts it. Customers see posted invoices. Check Billing periods when retrying after a failure.', '.ayal-workspace header', 'Contracts → Generate due invoices; Invoices → Confirm'],
    ['Record manual payments', 'Open a posted invoice and use the manual payment action. Enter the actual method, amount, date and reference. Record only a received payment. A partial payment leaves a balance; full settlement clears it. Check existing payments before retrying an interrupted request.', '.ayal-workspace .ayal-metrics', 'Subscriptions → Invoices → posted invoice'],
    ['Read financial totals', 'The workspace shows posted invoicing, outstanding balances, overdue debt and reconciled receipts in company currency. Financial date filters affect totals. Invoice totals and receipts measure different things; use invoice details to investigate balances.', '.ayal-workspace .ayal-metrics', 'Workspace → financial metrics and dates'],
];
const adminSteps = [
    ['Set up products and variants', 'In Configuration → Products and variants, maintain products and prices. Use Attributes & Variants and Configure for variant surcharges. Review taxes before quoting; changing a catalogue item does not rewrite accepted agreements.', '.ayal-workspace header', 'Subscriptions → Configuration → Products and variants'],
    ['Define plans and templates', 'Plans control recurrence, price, minimum quantity, availability and allowed lifecycle actions. Quotation templates add validity and contract terms. Configure these before staff prepare quotations.', '.ayal-workspace header', 'Configuration → Plans / Quotation templates'],
    ['Configure discounts and taxes', 'Review fixed or percentage discounts, eligible products, minimum quantity or purchase, validity dates and usage limits. Configure applicable taxes and verify a sample quotation before customer use.', '.ayal-workspace header', 'Configuration → Discounts / Taxes'],
    ['Schedule quantity changes', 'For a confirmed or active subscription, use Schedule quantity change to prepare an amendment at a future billing boundary. Review the effective date and new quantity; accepted agreement history is preserved.', '.ayal-workspace header', 'Contracts → Schedule quantity change'],
    ['Give staff the right access', 'Use Configuration → Add staff to provision a staff account. Grant finance or administrator access only when needed. Public signup creates a customer account, not a staff account. Email invitations require working outgoing mail.', '.ayal-workspace header', 'Configuration → Add staff'],
    ['Prepare customer access and email', 'Customers sign up at /web/signup, sign in and open My subscriptions. Work with your system administrator to configure outgoing mail for invitations and password resets. Before going live, use a public application URL so customers can open email links from their own devices.', '.ayal-workspace header', 'Customer signup /web/signup; administrator email settings'],
];

export function tourSteps(role, finance = false) {
    const steps = role === 'customer' ? customerSteps : [
        ...operationsSteps,
        ...(finance ? financeSteps : []),
        ...(role === 'admin' ? adminSteps : []),
        ['Recover and get help', 'Loading and empty states explain what is happening. On a request error, use Retry; after a potentially saved action, inspect the record before repeating it. Replay this guide with Take a tour whenever you need it.', '.ayal-workspace h1', 'Subscriptions → Workspace → Take a tour'],
    ];
    return steps.map(([title, text, target, location]) => ({ title, text, target, location }));
}

export class GuidedTour extends Component {
    static template = 'ayal_subscription.GuidedTour';
    static props = { role: String, identity: String, finance: { type: Boolean, optional: true } };
    setup() {
        this.state = useState({ open: false, index: 0, invited: false });
        this.dialog = useRef('dialog');
        this.launcher = useRef('launcher');
        this.heading = useRef('heading');
        this.steps = tourSteps(this.props.role, this.props.finance);
        // Browser-local and account/role-specific. No personal details or tokens are stored.
        this.key = `ayal-tour:v1:${this.props.identity}:${this.props.role}:${Boolean(this.props.finance)}`;
        onMounted(() => {
            let seen = false;
            try { seen = Boolean(localStorage.getItem(this.key)); } catch { /* Private browsers may disable storage. */ }
            this.state.invited = !seen;
        });
        useEffect(() => {
            this.clearHighlight();
            if (!this.state.open) return;
            this.heading.el?.focus();
            const scope = this.launcher.el?.closest('.ayal-portal, .ayal-workspace');
            this.highlight = scope?.querySelector(this.step.target);
            this.highlight?.classList.add('ayal-tour-highlight');
            this.highlight?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }, () => [this.state.open, this.state.index]);
        onWillUnmount(() => this.clearHighlight());
    }
    get step() { return this.steps[this.state.index]; }
    get roleLabel() { return { customer: 'Customer', staff: 'Staff', admin: 'Administrator' }[this.props.role]; }
    clearHighlight() { this.highlight?.classList.remove('ayal-tour-highlight'); this.highlight = null; }
    start() { this.state.index = 0; this.state.open = true; }
    close(status = 'skipped') {
        try { localStorage.setItem(this.key, status); } catch { /* The tour remains usable without persistence. */ }
        this.state.open = false;
        this.state.invited = false;
        this.clearHighlight();
        this.launcher.el?.focus();
    }
    next() {
        if (this.state.index === this.steps.length - 1) this.close('completed');
        else this.state.index++;
    }
    back() { this.state.index = Math.max(0, this.state.index - 1); }
    keydown(event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
        if (event.key !== 'Tab') return;
        const controls = [...this.dialog.el.querySelectorAll('button:not(:disabled), a[href]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === this.heading.el)) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
        }
    }
}
