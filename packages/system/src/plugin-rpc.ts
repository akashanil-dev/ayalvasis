import { pluginBytes, PLUGIN_LIMITS, type PluginManager, type PluginRPCRequest, type PluginRPCResponse } from '@tuxos/sdk';
import type { SystemClient } from './index';

/** Untrusted iframe requests are validated and routed exclusively through private plugin storage. */
export class PluginRPCGateway {
  private readonly bindings = new Set<() => void>();
  private readonly plugins: PluginManager | undefined;
  private destroyed = false;
  private readonly generations = new Map<string, number>();

  constructor(private readonly system: SystemClient) { this.plugins = system.plugins?.(); }

  async handleRequest(pluginId: string, request: unknown): Promise<PluginRPCResponse> {
    const data = request as Partial<PluginRPCRequest> | null;
    const id = typeof data?.id === 'string' ? data.id.slice(0, 80) : '';
    const fail = (code: string, message: string): PluginRPCResponse => ({ jsonrpc: '2.0', id, ok: false, error: { code, message } });
    if (!data || data.jsonrpc !== '2.0' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || data.id !== id
      || typeof data.method !== 'string' || !data.params || typeof data.params !== 'object' || Array.isArray(data.params)) return fail('EINVAL', 'Invalid JSON-RPC request.');
    try {
      if (pluginBytes(data) > PLUGIN_LIMITS.rpcBytes) return fail('E2BIG', 'Plugin request exceeds 64 KB.');
      if (!this.authorized(pluginId)) return fail('EPERM', 'Plugin is disabled, uninstalled or belongs to an ended session.');
      if (data.method === 'kernel.dispatch') {
        const { type, payload } = data.params;
        if (typeof type !== 'string') return fail('EINVAL', 'Missing action type.');
        const result = await this.plugins!.dispatch(pluginId, type, payload);
        if (!this.authorized(pluginId)) return fail('EPERM', 'Plugin authorization has ended.');
        if (result.ok && pluginBytes(result.value ?? null) > 256 * 1024) return fail('E2BIG', 'Plugin response is too large.');
        return { jsonrpc: '2.0', id, ok: result.ok, ...(result.ok ? { result: result.value ?? null } : { error: result.error }) };
      }
      if (data.method === 'kernel.user' || data.method === 'kernel.hostname') {
        const result = await (data.method === 'kernel.user' ? this.system.user() : this.system.hostname());
        return this.authorized(pluginId) ? { jsonrpc: '2.0', id, ok: true, result } : fail('EPERM', 'Plugin authorization has ended.');
      }
      return fail('ENOSYS', 'Unsupported plugin method.');
    } catch (err) { return fail('EINVAL', err instanceof Error ? err.message : 'Invalid plugin request.'); }
  }

  /** Per-frame channels prevent messages from another iframe or a previous document being accepted. */
  bindWindow(pluginId: string, contentWindow: Window, channel: string, generation = this.plugins?.generation(pluginId)): () => void {
    if (generation !== undefined) this.generations.set(pluginId, generation);
    let live = true, hits = 0, windowStart = Date.now(), inFlight = 0;
    let unsubscribe: (() => void) | undefined;
    const currentDocument = () => generation !== undefined && this.plugins?.generation(pluginId) === generation && this.authorized(pluginId);
    const reply = (message: unknown) => { if (live && !this.destroyed) contentWindow.postMessage({ ...(message as object), channel }, '*'); };
    const handler = async (event: MessageEvent) => {
      if (!live || this.destroyed || event.source !== contentWindow || event.origin !== 'null') return;
      const data = event.data as PluginRPCRequest & { channel?: unknown };
      if (!data || data.channel !== channel || data.jsonrpc !== '2.0') return;
      if (Date.now() - windowStart >= 1000) { hits = 0; windowStart = Date.now(); }
      if (++hits > 60 || inFlight >= 4) {
        // Avoid amplifying floods with one reply per rejected message.
        if (hits === 61) reply({ jsonrpc: '2.0', id: typeof data.id === 'string' ? data.id.slice(0, 80) : '', ok: false, error: { code: 'EBUSY', message: 'Plugin request limit reached.' } });
        return;
      }
      inFlight++;
      try {
        if (!currentDocument()) {
          reply({ jsonrpc: '2.0', id: typeof data.id === 'string' ? data.id.slice(0, 80) : '', ok: false, error: { code: 'EPERM', message: 'This plugin document is no longer authorized.' } });
          return;
        }
        if (data.method === 'kernel.subscribe' || data.method === 'kernel.unsubscribe') {
          const validated = await this.handleRequest(pluginId, { ...data, method: 'kernel.user' });
          if (!validated.ok || !currentDocument()) { reply({ ...validated, ok: false, error: { code: 'EPERM', message: 'Plugin authorization has ended.' } }); return; }
          if (data.method === 'kernel.unsubscribe') { unsubscribe?.(); unsubscribe = undefined; }
          else if (!unsubscribe) unsubscribe = this.system.subscribe((event) => {
            if (currentDocument() && event.actor.kind === 'module' && event.actor.id === pluginId) {
              // Do not stream file contents or request payloads back through the event channel.
              reply({ jsonrpc: '2.0', event: 'kernel.event', data: { seq: event.seq, type: event.action.type, ok: event.ok } });
            }
          });
          reply({ jsonrpc: '2.0', id: data.id, ok: true, result: { subscribed: !!unsubscribe } });
        } else {
          const response = await this.handleRequest(pluginId, data);
          reply(currentDocument() ? response : { jsonrpc: '2.0', id: response.id, ok: false, error: { code: 'EPERM', message: 'Plugin authorization has ended.' } });
        }
      } catch {
        reply({ jsonrpc: '2.0', id: typeof data.id === 'string' ? data.id.slice(0, 80) : '', ok: false, error: { code: 'EIO', message: 'The plugin session is no longer available.' } });
      } finally { inFlight--; }
    };
    window.addEventListener('message', handler);
    const unbind = () => {
      live = false;
      window.removeEventListener('message', handler);
      unsubscribe?.();
      this.bindings.delete(unbind);
    };
    this.bindings.add(unbind);
    return unbind;
  }

  destroy(): void { this.destroyed = true; for (const unbind of [...this.bindings]) unbind(); }

  private authorized(id: string): boolean {
    if (this.destroyed || !this.plugins?.isEnabled(id)) return false;
    try {
      if (this.system.plugins?.() !== this.plugins) return false;
      const generation = this.plugins.generation(id);
      if (generation === undefined) return false;
      if (!this.generations.has(id)) this.generations.set(id, generation);
      return this.generations.get(id) === generation;
    } catch { return false; }
  }
}
