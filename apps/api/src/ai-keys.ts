// Learners bring their own OpenAI API key. A signed-in learner's key is saved with their account, encrypted
// (AES-256-GCM) with a server secret kept outside the database, so a copy of the database alone reveals no
// keys. Guests keep their key in their own browser and send it with each AI request.
//   GET    /api/ai/key          -> {saved, hint} for the signed-in account
//   PUT    /api/ai/key  {key}   -> checks the key with OpenAI, then saves it
//   DELETE /api/ai/key          -> forgets it
//   POST   /api/ai/test {key}   -> checks a key without saving it (guests)

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The header a guest's browser sends its key in. */
export const KEY_HEADER = 'x-openai-key';

/** API keys are long single tokens; this only rules out what can't be one, OpenAI decides the rest. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{20,300}$/;

export function validKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_SHAPE.test(value);
}

/** Enough of a key to recognise it in Settings, never enough to use it. */
export function keyHint(key: string): string {
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

/** Encrypts keys for storage. A sealed key is `v1.<iv>.<tag>.<ciphertext>`, each part base64url. */
export class KeyBox {
  private readonly secret: Buffer;

  constructor(secret: Buffer) {
    if (secret.length !== 32) throw new Error('the key secret must be 32 bytes');
    this.secret = secret;
  }

  seal(key: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.secret, iv);
    const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
  }

  /** The key, or undefined if it was sealed with another secret or has been tampered with. */
  open(sealed: string): string | undefined {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || !data) return undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.secret, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return undefined;
    }
  }
}

/**
 * The secret from TUXOS_KEY_SECRET (64 hex characters), or from a file created on first start, readable only
 * by the server's user. Losing it only means learners enter their keys again.
 */
export function loadKeySecret(fromEnv: string | undefined, file: string): Buffer {
  if (fromEnv) {
    if (!/^[0-9a-f]{64}$/i.test(fromEnv)) throw new Error('TUXOS_KEY_SECRET must be 64 hex characters (openssl rand -hex 32)');
    return Buffer.from(fromEnv, 'hex');
  }
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
  }
  return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
}

export type KeyCheck = { ok: true } | { ok: false; status: number; error: string };

/** Asks OpenAI whether the key works, by listing models: it costs nothing and needs no model access. */
export async function checkKey(key: string, baseUrl: string, fetcher: typeof fetch = fetch): Promise<KeyCheck> {
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, status: 502, error: 'Could not reach OpenAI to check the key. Try again.' };
  }
  if (response.ok) return { ok: true };
  if (response.status === 401) return { ok: false, status: 400, error: 'OpenAI did not accept this key. Check that you copied all of it.' };
  if (response.status === 403) return { ok: false, status: 400, error: 'This key is not allowed to use the OpenAI API (check its permissions).' };
  if (response.status === 429) return { ok: false, status: 400, error: 'This key has no credits left, or is being rate limited.' };
  return { ok: false, status: 502, error: `OpenAI could not check the key (HTTP ${response.status}). Try again.` };
}

export interface KeyStore {
  aiKey(userId: number): { sealed: string; hint: string } | undefined;
  setAiKey(userId: number, sealed: string, hint: string): void;
  removeAiKey(userId: number): void;
}

/** The /api/ai/* routes. `userId` is the signed-in account, if any. */
export async function handleAiKey(
  method: string, path: string, body: unknown, userId: number | undefined,
  store: KeyStore, box: KeyBox, baseUrl: string, fetcher: typeof fetch = fetch,
): Promise<{ status: number; body: unknown }> {
  const key = (body as { key?: unknown } | null)?.key;
  if (method === 'POST' && path === '/api/ai/test') {
    if (!validKey(key)) return { status: 400, body: { error: 'That does not look like an API key.' } };
    const check = await checkKey(key, baseUrl, fetcher);
    return check.ok ? { status: 200, body: { ok: true, hint: keyHint(key) } } : { status: check.status, body: { error: check.error } };
  }
  if (path !== '/api/ai/key') return { status: 404, body: { error: 'Not found.' } };
  if (userId === undefined) return { status: 401, body: { error: 'Not signed in.' } };
  if (method === 'GET') {
    const saved = store.aiKey(userId);
    // A key sealed with a lost secret can't be used: report it as missing so the learner enters it again.
    return { status: 200, body: saved && box.open(saved.sealed) ? { saved: true, hint: saved.hint } : { saved: false } };
  }
  if (method === 'PUT') {
    if (!validKey(key)) return { status: 400, body: { error: 'That does not look like an API key.' } };
    const check = await checkKey(key, baseUrl, fetcher);
    if (!check.ok) return { status: check.status, body: { error: check.error } };
    store.setAiKey(userId, box.seal(key), keyHint(key));
    return { status: 200, body: { saved: true, hint: keyHint(key) } };
  }
  if (method === 'DELETE') {
    store.removeAiKey(userId);
    return { status: 200, body: { saved: false } };
  }
  return { status: 405, body: { error: 'Method not allowed.' } };
}
