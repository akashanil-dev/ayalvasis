import { afterEach, describe, expect, it, vi } from 'vitest';
import { webAiKeys } from './ai-key';

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123';

/** A stand-in for the API: records requests and answers each path with the given body and status. */
function api(routes: Record<string, [number, unknown]>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, path, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const [status, body] = routes[`${method} ${path}`] ?? [404, { error: 'Not found.' }];
    return Response.json(body, { status });
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AI key in the browser', () => {
  it('is off for a guest without a key when the server provides none', async () => {
    api({ 'GET /api/health': [200, { ok: true, serverKey: false }] });
    const keys = webAiKeys();
    await keys.load(false);
    expect(keys.status()).toEqual({ enabled: false, source: null, signedIn: false });
    expect(keys.headers()).toEqual({});
  });

  it('keeps a guest key in this browser after the server checks it, and sends it with AI requests', async () => {
    const calls = api({ 'GET /api/health': [200, { serverKey: false }], 'POST /api/ai/test': [200, { ok: true }] });
    const keys = webAiKeys();
    await keys.load(false);
    const changes: unknown[] = [];
    keys.onChange((status) => changes.push(status));
    expect(await keys.save(`  ${KEY} `)).toEqual({ enabled: true, source: 'browser', hint: 'sk-…0123', signedIn: false });
    expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/ai/test', body: { key: KEY } });
    expect(keys.headers()).toEqual({ 'x-openai-key': KEY });
    expect(changes).toHaveLength(1);
    expect((await keys.remove()).enabled).toBe(false);
    expect(keys.headers()).toEqual({});
  });

  it('does not store a guest key the server rejected', async () => {
    api({ 'GET /api/health': [200, { serverKey: false }], 'POST /api/ai/test': [400, { error: 'OpenAI did not accept this key.' }] });
    const keys = webAiKeys();
    await keys.load(false);
    await expect(keys.save(KEY)).rejects.toThrow('did not accept');
    expect(keys.status().enabled).toBe(false);
    expect(keys.headers()).toEqual({});
  });

  it("saves a signed-in learner's key in the account, never in the browser", async () => {
    const calls = api({
      'GET /api/health': [200, { serverKey: false }],
      'GET /api/ai/key': [200, { saved: false }],
      'PUT /api/ai/key': [200, { saved: true, hint: 'sk-…0123' }],
      'DELETE /api/ai/key': [200, { saved: false }],
    });
    localStorage.setItem('tuxos.openai-key', 'sk-guest-key-from-before-0000000');
    const keys = webAiKeys();
    await keys.load(true);
    // A guest key left in this browser is not used for an account.
    expect(keys.status()).toEqual({ enabled: false, source: null, signedIn: true });
    expect(keys.headers()).toEqual({});
    expect(await keys.save(KEY)).toEqual({ enabled: true, source: 'account', hint: 'sk-…0123', signedIn: true });
    expect(calls.at(-1)).toEqual({ method: 'PUT', path: '/api/ai/key', body: { key: KEY } });
    expect(keys.headers()).toEqual({});
    expect((await keys.remove()).enabled).toBe(false);
  });

  it('reports a key the server provides for everyone', async () => {
    api({ 'GET /api/health': [200, { serverKey: true }], 'GET /api/ai/key': [200, { saved: false }] });
    const keys = webAiKeys();
    await keys.load(true);
    expect(keys.status()).toEqual({ enabled: true, source: 'server', signedIn: true });
  });
});
