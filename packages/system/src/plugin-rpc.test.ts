import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalSystem, type SystemClient } from './index';
import { PluginRPCGateway } from './plugin-rpc';

const systems: SystemClient[] = [];
const gateways: PluginRPCGateway[] = [];
afterEach(async () => { gateways.splice(0).forEach(g => g.destroy()); for (const s of systems.splice(0)) await s.reset(); });
async function setup(capabilities = ['fs:read', 'fs:write']) {
  const values = new Map<string, string>();
  const system = createLocalSystem({ modules: [], storage: { get: async k => values.get(k) ?? null, set: async (k,v) => {values.set(k,v);}, remove: async k => {values.delete(k);} } });
  systems.push(system); await system.boot('ada');
  await system.plugins!().install({ format: 'tuxos-plugin', formatVersion: 1, manifest: { id: 'test-plugin', name: 'Test', version: '1.0.0', description: '', capabilities,
    contributes: { apps: [{ id: 'test-app', title: 'Test', icon: '🧩' }] } }, html: '<h1>Test</h1>' }, { approvedCapabilities: capabilities });
  await system.openApp('test-app');
  const gateway = new PluginRPCGateway(system); gateways.push(gateway);
  const request = (method: string, params: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 'req-1', method, params });
  return { system, gateway, request };
}

describe('plugin RPC security boundary', () => {
  it('records private writes as the plugin actor and supports only scoped files and metadata', async () => {
    const { system, gateway, request } = await setup();
    const events: string[] = [];
    system.subscribe(e => { if (e.action.type === 'plugins.storageWrite') events.push(`${e.actor.kind}:${e.actor.id}`); });
    expect(await gateway.handleRequest('test-plugin', request('kernel.dispatch', { type: 'fs.write', payload: { path: 'note', content: 'hi' } }))).toMatchObject({ ok: true });
    expect(events).toEqual(['module:test-plugin']);
    expect(await gateway.handleRequest('test-plugin', request('kernel.dispatch', { type: 'fs.read', payload: { path: 'note' } }))).toMatchObject({ ok: true, result: 'hi' });
    expect(await gateway.handleRequest('test-plugin', request('kernel.user'))).toMatchObject({ ok: true, result: 'ada' });
    expect(await gateway.handleRequest('test-plugin', request('kernel.hostname'))).toMatchObject({ ok: true, result: 'tuxos' });
    expect(await gateway.handleRequest('test-plugin', request('kernel.dispatch', { type: 'fs.read', payload: { path: '/etc/hostname' } }))).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    expect(await gateway.handleRequest('test-plugin', request('kernel.dispatch', { type: 'session.open', payload: { appId: 'terminal' } }))).toMatchObject({ ok: false, error: { code: 'EPERM' } });
  });

  it('enforces capabilities and revokes an existing bridge when disabled or switching users', async () => {
    const { system, gateway, request } = await setup(['fs:read']);
    expect(await gateway.handleRequest('test-plugin', request('kernel.dispatch', { type: 'fs.write', payload: { path: 'note', content: 'bad' } }))).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    await system.plugins!().setEnabled('test-plugin', false);
    expect(await gateway.handleRequest('test-plugin', request('kernel.user'))).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    await system.boot('grace');
    expect(await gateway.handleRequest('test-plugin', request('kernel.user'))).toMatchObject({ ok: false });
  });

  it('validates all incoming shapes and caps request size', async () => {
    const { gateway, request } = await setup();
    for (const data of [null, [], {}, { ...request('kernel.user'), id: {} }, { ...request('kernel.user'), params: [] }, { ...request('kernel.user'), jsonrpc: '1.0' }]) {
      expect(await gateway.handleRequest('test-plugin', data)).toMatchObject({ ok: false, error: { code: 'EINVAL' } });
    }
    expect(await gateway.handleRequest('test-plugin', request('kernel.dispatch', { type: 'fs.write', payload: { path: 'huge', content: 'x'.repeat(65 * 1024) } }))).toMatchObject({ ok: false, error: { code: 'E2BIG' } });
    expect(await gateway.handleRequest('test-plugin', request('unknown'))).toMatchObject({ ok: false, error: { code: 'ENOSYS' } });
  });

  it('does not revive an old bridge after disabling and re-enabling the same package', async () => {
    const { system, gateway, request } = await setup();
    expect(await gateway.handleRequest('test-plugin', request('kernel.user'))).toMatchObject({ ok: true });
    await system.plugins!().setEnabled('test-plugin', false);
    await system.plugins!().setEnabled('test-plugin', true, { approvedCapabilities: ['fs:read', 'fs:write'] });
    await system.openApp('test-app');
    expect(await gateway.handleRequest('test-plugin', request('kernel.user'))).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    const replacement = new PluginRPCGateway(system); gateways.push(replacement);
    expect(await replacement.handleRequest('test-plugin', request('kernel.user'))).toMatchObject({ ok: true });
  });

  it('does not return in-flight private data after authority is revoked', async () => {
    const { system, gateway, request } = await setup();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(system.plugins!(), 'dispatch').mockImplementationOnce(async () => { await pending; return { ok: true, value: 'private data' }; });
    const response = gateway.handleRequest('test-plugin', request('kernel.dispatch', { type: 'fs.read', payload: { path: 'note' } }));
    await system.plugins!().setEnabled('test-plugin', false);
    release();
    expect(await response).toMatchObject({ ok: false, error: { code: 'EPERM' } });
    expect(await response).not.toHaveProperty('result');
  });

  it('bounds floods and remembers a frame’s generation before its first message', async () => {
    const { system, gateway, request } = await setup();
    const target = { postMessage: vi.fn() } as unknown as Window;
    gateway.bindWindow('test-plugin', target, 'channel');
    await system.plugins!().setEnabled('test-plugin', false);
    await system.plugins!().setEnabled('test-plugin', true, { approvedCapabilities: ['fs:read', 'fs:write'] });
    for (let index = 0; index < 70; index++) window.dispatchEvent(new MessageEvent('message', { source: target, origin: 'null', data: { ...request('kernel.user'), id: `req-${index}`, channel: 'channel' } }));
    await vi.waitFor(() => expect(target.postMessage).toHaveBeenCalled());
    expect(vi.mocked(target.postMessage).mock.calls.length).toBeLessThanOrEqual(61);
    expect(vi.mocked(target.postMessage).mock.calls.every(([message]) => !(message as { ok?: boolean }).ok)).toBe(true);
  });

  it('accepts only the bound opaque frame and its channel, isolates multiple windows, and cleans up subscriptions', async () => {
    const { system, gateway, request } = await setup();
    const first = { postMessage: vi.fn() } as unknown as Window;
    const second = { postMessage: vi.fn() } as unknown as Window;
    const unbind = gateway.bindWindow('test-plugin', first, 'first-channel');
    gateway.bindWindow('test-plugin', second, 'second-channel');
    const send = (source: Window, channel: string, method = 'kernel.user', origin = 'null') => window.dispatchEvent(new MessageEvent('message', { source, origin, data: { ...request(method), channel } }));
    send(second, 'first-channel'); send(first, 'wrong'); send(first, 'first-channel', 'kernel.user', 'https://evil.test');
    await Promise.resolve();
    expect(first.postMessage).not.toHaveBeenCalled(); expect(second.postMessage).not.toHaveBeenCalled();
    send(first, 'first-channel');
    await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: 'first-channel', result: 'ada' }), '*'));
    send(second, 'second-channel', 'kernel.subscribe');
    await vi.waitFor(() => expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({ result: { subscribed: true } }), '*'));
    unbind();
    await system.plugins!().dispatch('test-plugin', 'fs.write', { path: 'note', content: 'secret' });
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'kernel.event', data: expect.not.objectContaining({ action: expect.anything() }) }), '*');
    const before = vi.mocked(first.postMessage).mock.calls.length;
    send(first, 'first-channel'); await Promise.resolve();
    expect(vi.mocked(first.postMessage).mock.calls.length).toBe(before);
    gateway.destroy();
    const count = vi.mocked(second.postMessage).mock.calls.length;
    await system.plugins!().dispatch('test-plugin', 'fs.write', { path: 'note', content: 'after' });
    expect(vi.mocked(second.postMessage).mock.calls.length).toBe(count);
  });
});
