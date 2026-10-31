import { describe, expect, test } from '@odoo/hoot';
import { patchWithCleanup } from '@web/../tests/web_test_helpers';
import { Workspace } from '@ayal_subscription/backend/workspace';
import { SubscriptionPortal } from '@ayal_subscription/portal/portal';

describe('Ayal subscriptions', () => {
    test('a stale workspace response cannot replace the latest search', async () => {
        let resolveFirst;
        let calls = 0;
        const fake = { generation: 0, state: {query:'',filter:'',page:0}, orm: {call: () => ++calls === 1 ? new Promise(resolve => {resolveFirst=resolve;}) : Promise.resolve({rows:[{id:2}], count:1})} };
        const first = Workspace.prototype.load.call(fake);
        await Workspace.prototype.load.call(fake);
        resolveFirst({rows:[{id:1}],count:1});
        await first;
        expect(fake.state.rows).toEqual([{id:2}]);
        expect(fake.state.loading).toBe(false);
    });
    test('workspace request errors remain recoverable', async () => {
        const fake = {generation:0,state:{},orm:{call:async()=>{throw new Error('Server unavailable');}}};
        await Workspace.prototype.load.call(fake);
        expect(fake.state.error).toBe('Server unavailable');
        expect(fake.state.loading).toBe(false);
    });
    test('a double click sends only one portal mutation', async () => {
        let finish;
        let calls=0;
        patchWithCleanup(globalThis,{fetch:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
        const fake = {state:{confirm:{id:1,action:'pause'},busy:false},csrf:'test',load:async()=>{}};
        const first = SubscriptionPortal.prototype.execute.call(fake);
        await SubscriptionPortal.prototype.execute.call(fake);
        finish({ok:true,headers:{get:()=> 'application/json'},json:async()=>({ok:true})});
        await first;
        expect(calls).toBe(1);
        expect(fake.state.confirm).toBe(null);
        expect(fake.state.busy).toBe(false);
    });
    test('a server denial preserves the confirmation and displays the reason', async () => {
        patchWithCleanup(globalThis,{fetch:async()=>({ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'Quotation expired'})})});
        const fake={state:{confirm:{id:1,action:'accept'},busy:false},csrf:'test',load:async()=>{}};
        await SubscriptionPortal.prototype.execute.call(fake);
        expect(fake.state.error).toBe('Quotation expired');
        expect(fake.state.confirm.id).toBe(1);
        expect(fake.state.busy).toBe(false);
    });
});
