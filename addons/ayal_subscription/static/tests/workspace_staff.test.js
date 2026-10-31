import { describe, expect, test } from '@odoo/hoot';
import { Workspace } from '@ayal_subscription/backend/workspace';

describe('Ayal subscriptions staff navigation', () => {
    test('pagination rejects movement outside the result set', () => {
        let calls = 0;
        const fake = {state: {page: 0, count: 25}, load: () => calls++};
        Workspace.prototype.page.call(fake, -1);
        Workspace.prototype.page.call(fake, 1);
        expect(fake.state.page).toBe(0);
        expect(calls).toBe(0);
    });
    test('pagination waits for requests and recovery', () => {
        let calls = 0;
        const fake = {state: {page: 0, count: 50, loading: true}, load: () => calls++};
        Workspace.prototype.page.call(fake, 1);
        fake.state.loading = false;
        fake.state.error = 'Offline';
        Workspace.prototype.page.call(fake, 1);
        expect(calls).toBe(0);
        expect(fake.state.page).toBe(0);
    });
    test('next page loads an available result page', () => {
        let calls = 0;
        const fake = {state: {page: 0, count: 26}, load: () => calls++};
        Workspace.prototype.page.call(fake, 1);
        expect(fake.state.page).toBe(1);
        expect(calls).toBe(1);
    });
    test('clearing filters resets pagination and retains financial dates', () => {
        let calls = 0;
        const fake = {state: {page: 2, query: 'Alice', filter: 'active', dateFrom: '2026-10-01'},
            load: () => calls++, search: Workspace.prototype.search};
        Workspace.prototype.clearFilters.call(fake);
        expect(fake.state.query).toBe('');
        expect(fake.state.filter).toBe('');
        expect(fake.state.page).toBe(0);
        expect(fake.state.dateFrom).toBe('2026-10-01');
        expect(calls).toBe(1);
    });
});
