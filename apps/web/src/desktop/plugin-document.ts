/** CSP is placed before all authored content. No same-origin, forms, popups or top navigation are granted. */
export const PLUGIN_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; media-src 'none'; worker-src 'none'";

export function createPluginDocument(html: string, channel: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // A package cannot redirect via refresh, replace the host policy or change relative URL resolution.
  doc.querySelectorAll('meta[http-equiv], base').forEach((element) => element.remove());
  const sdk = `
(() => {
  'use strict';
  const channel = ${JSON.stringify(channel)};
  const pending = new Map(), listeners = new Set();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const send = (id, method, params) => parent.postMessage({jsonrpc:'2.0',id,method,params,channel}, '*');
  const hello = () => send('bridge-ready','kernel.user',{});
  const handshake = setInterval(hello, 100);
  const deadline = setTimeout(() => { clearInterval(handshake); rejectReady(new Error('Plugin connection timed out. Reopen the app.')); }, 8000);
  addEventListener('message', event => {
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || data.channel !== channel || data.jsonrpc !== '2.0') return;
    if (data.id === 'bridge-ready') {
      clearInterval(handshake); clearTimeout(deadline);
      data.ok ? resolveReady() : rejectReady(new Error(data.error?.message || 'Plugin connection denied.'));
      return;
    }
    if (data.event === 'kernel.event') { for (const listener of listeners) { try { listener(data.data); } catch {} } return; }
    const call = pending.get(data.id);
    if (!call) return;
    pending.delete(data.id); clearTimeout(call.timer);
    if (data.ok) call.resolve(data.result);
    else { const error = new Error(data.error?.message || 'Plugin request failed.'); error.code = data.error?.code; call.reject(error); }
  });
  const request = async (method, params = {}) => {
    await ready;
    if (pending.size >= 32) throw new Error('Too many pending plugin requests.');
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Plugin request timed out.')); }, 10000);
      pending.set(id, {resolve, reject, timer}); send(id, method, params);
    });
  };
  const dispatch = (type, payload) => request('kernel.dispatch', {type, payload});
  Object.defineProperty(window, 'tuxos', {value: Object.freeze({
    ready, dispatch, user: () => request('kernel.user'), hostname: () => request('kernel.hostname'),
    storage: Object.freeze({
      read: path => dispatch('fs.read', {path}),
      write: (path, content) => dispatch('fs.write', {path, content}),
      list: (path = '.') => dispatch('fs.list', {path}),
      mkdir: path => dispatch('fs.mkdir', {path, parents:true}),
      remove: path => dispatch('fs.remove', {path, recursive:true})
    }),
    subscribe: async listener => {
      if (typeof listener !== 'function' || listeners.size >= 32) throw new Error('Invalid event subscription.');
      await request('kernel.subscribe'); listeners.add(listener);
      return () => { listeners.delete(listener); if (!listeners.size) request('kernel.unsubscribe').catch(() => {}); };
    }
  }), writable:false, configurable:false});
  // External link clicks are not part of the portable, self-contained plugin format.
  addEventListener('click', event => { if (event.target.closest?.('a[href]')) event.preventDefault(); }, true);
  hello();
})();`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PLUGIN_CSP}"><meta name="referrer" content="no-referrer"><script>${sdk}</script>${doc.head.innerHTML}</head><body>${doc.body.innerHTML}</body></html>`;
}
