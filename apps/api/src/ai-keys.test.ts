import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Accounts } from './accounts.ts';
import { checkKey, handleAiKey, KeyBox, keyHint, loadKeySecret, validKey } from './ai-keys.ts';

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123';
const secret = Buffer.alloc(32, 7);

/** A stand-in for OpenAI's GET /models: accepts KEY only. */
const openai = (calls: string[] = []): typeof fetch => async (_url, init) => {
  const auth = new Headers(init?.headers).get('authorization') ?? '';
  calls.push(auth);
  return new Response('{}', { status: auth === `Bearer ${KEY}` ? 200 : 401 });
};

describe('KeyBox', () => {
  it('seals keys so the stored text does not contain them, and opens them again', () => {
    const box = new KeyBox(secret);
    const sealed = box.seal(KEY);
    expect(sealed).not.toContain(KEY.slice(3, 20));
    expect(box.open(sealed)).toBe(KEY);
    // Two seals of the same key differ (random IV).
    expect(box.seal(KEY)).not.toBe(sealed);
  });

  it('refuses a key sealed with another secret, or tampered with', () => {
    const sealed = new KeyBox(secret).seal(KEY);
    expect(new KeyBox(Buffer.alloc(32, 8)).open(sealed)).toBeUndefined();
    const [version, iv, tag, data] = sealed.split('.');
    const flipped = `${data!.startsWith('A') ? 'B' : 'A'}${data!.slice(1)}`;
    expect(new KeyBox(secret).open([version, iv, tag, flipped].join('.'))).toBeUndefined();
  });

  it('creates a private secret file on first start and reuses it', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'tuxos-keys-')), 'data', 'key-secret');
    const first = loadKeySecret(undefined, file);
    expect(first).toHaveLength(32);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(loadKeySecret(undefined, file).equals(first)).toBe(true);
    expect(readFileSync(file, 'utf8').trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(loadKeySecret('ab'.repeat(32), file).equals(Buffer.alloc(32, 0xab))).toBe(true);
    expect(() => loadKeySecret('short', file)).toThrow('64 hex');
  });
});

describe('keys', () => {
  it('accepts key-shaped strings only and hints without revealing the key', () => {
    expect(validKey(KEY)).toBe(true);
    expect(validKey('sk-short')).toBe(false);
    expect(validKey(`${KEY} extra`)).toBe(false);
    expect(validKey(42)).toBe(false);
    expect(keyHint(KEY)).toBe('sk-…0123');
  });

  it('turns OpenAI replies into plain advice', async () => {
    expect(await checkKey(KEY, 'https://api.test', openai())).toEqual({ ok: true });
    expect(await checkKey(`${KEY}x`, 'https://api.test', openai())).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('did not accept') });
    const offline: typeof fetch = async () => { throw new TypeError('fetch failed'); };
    expect(await checkKey(KEY, 'https://api.test', offline)).toMatchObject({ ok: false, status: 502 });
  });
});

describe('/api/ai routes', () => {
  let accounts: Accounts | undefined;
  afterEach(() => accounts?.close());

  async function signedIn() {
    accounts = new Accounts(':memory:', false);
    const reply = await accounts.handle('POST', '/api/auth/register', { username: 'ada', password: 'pw' }, undefined);
    const cookie = reply.cookie!.split(';')[0];
    return { accounts, userId: accounts.user(cookie)!.id };
  }

  it('saves a checked key sealed in the account, reports only its hint, and forgets it', async () => {
    const { accounts, userId } = await signedIn();
    const box = new KeyBox(secret);
    const route = (method: string, body: unknown = null) =>
      handleAiKey(method, '/api/ai/key', body, userId, accounts, box, 'https://api.test', openai());
    expect(await route('GET')).toEqual({ status: 200, body: { saved: false } });
    expect(await route('PUT', { key: 'sk-wrong-key-0000000000000000' })).toMatchObject({ status: 400 });
    expect(await route('PUT', { key: KEY })).toEqual({ status: 200, body: { saved: true, hint: 'sk-…0123' } });
    const stored = accounts.aiKey(userId)!;
    expect(stored.sealed).not.toContain(KEY.slice(3));
    expect(box.open(stored.sealed)).toBe(KEY);
    expect(await route('GET')).toEqual({ status: 200, body: { saved: true, hint: 'sk-…0123' } });
    // A key sealed under a lost secret counts as not saved, so Settings asks for it again.
    expect(await handleAiKey('GET', '/api/ai/key', null, userId, accounts, new KeyBox(Buffer.alloc(32, 1)), 'https://api.test'))
      .toEqual({ status: 200, body: { saved: false } });
    expect(await route('DELETE', {})).toEqual({ status: 200, body: { saved: false } });
    expect(accounts.aiKey(userId)).toBeUndefined();
  });

  it('needs an account to save, but lets guests check a key', async () => {
    const { accounts } = await signedIn();
    const box = new KeyBox(secret);
    expect(await handleAiKey('PUT', '/api/ai/key', { key: KEY }, undefined, accounts, box, 'https://api.test', openai()))
      .toMatchObject({ status: 401 });
    const calls: string[] = [];
    expect(await handleAiKey('POST', '/api/ai/test', { key: KEY }, undefined, accounts, box, 'https://api.test', openai(calls)))
      .toEqual({ status: 200, body: { ok: true, hint: 'sk-…0123' } });
    expect(calls).toEqual([`Bearer ${KEY}`]);
    expect(await handleAiKey('POST', '/api/ai/test', { key: 'nope' }, undefined, accounts, box, 'https://api.test', openai()))
      .toMatchObject({ status: 400 });
  });
});
