// The learner's own OpenAI API key (apps/api/src/ai-keys.ts). A signed-in learner's key is saved, encrypted,
// in their account and the browser never sees it again; a guest's key stays in this browser and goes with
// each AI request in a header. With no key at all, AI features are off unless the server provides one.

import type { AiKeyStore, AiStatus } from '@tuxos/system';

const GUEST_KEY = 'tuxos.openai-key';
const KEY_HEADER = 'x-openai-key';

export interface WebAiKeys extends AiKeyStore {
  /** Reload the status for a guest or a signed-in account; call before booting that learner's system. */
  load(signedIn: boolean): Promise<void>;
}

function readGuestKey(): string | null {
  try { return localStorage.getItem(GUEST_KEY); } catch { return null; }
}

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('The server is not reachable. Check your connection.');
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `The server failed (HTTP ${response.status}).`);
  return data;
}

const hintOf = (key: string) => `${key.slice(0, 3)}…${key.slice(-4)}`;

export function webAiKeys(): WebAiKeys {
  let signedIn = false;
  let serverKey = false;
  let accountHint: string | undefined;
  const listeners = new Set<(status: AiStatus) => void>();

  const status = (): AiStatus => {
    const guestKey = signedIn ? null : readGuestKey();
    if (signedIn && accountHint) return { enabled: true, source: 'account', hint: accountHint, signedIn };
    if (guestKey) return { enabled: true, source: 'browser', hint: hintOf(guestKey), signedIn };
    return { enabled: serverKey, source: serverKey ? 'server' : null, signedIn };
  };
  const changed = () => {
    const now = status();
    for (const listener of listeners) listener(now);
    return now;
  };

  return {
    status,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(account) {
      signedIn = account;
      accountHint = undefined;
      // If the server can't be asked, AI stays off: the built-in lessons still work.
      const [health, saved] = await Promise.all([
        call('GET', '/api/health').catch(() => ({})),
        account ? call('GET', '/api/ai/key').catch(() => ({})) : Promise.resolve({}),
      ]);
      serverKey = (health as { serverKey?: unknown }).serverKey === true;
      if ((saved as { saved?: unknown }).saved === true) accountHint = String((saved as { hint?: unknown }).hint ?? '');
      changed();
    },
    async save(raw) {
      const key = raw.trim();
      if (signedIn) {
        const reply = await call('PUT', '/api/ai/key', { key });
        accountHint = String(reply.hint ?? hintOf(key));
      } else {
        await call('POST', '/api/ai/test', { key });
        try { localStorage.setItem(GUEST_KEY, key); } catch { throw new Error('This browser would not store the key (private window?).'); }
      }
      return changed();
    },
    async remove() {
      if (signedIn) {
        await call('DELETE', '/api/ai/key', {});
        accountHint = undefined;
      } else {
        try { localStorage.removeItem(GUEST_KEY); } catch { /* nothing stored */ }
      }
      return changed();
    },
    headers(): Record<string, string> {
      const guestKey = signedIn ? null : readGuestKey();
      return guestKey ? { [KEY_HEADER]: guestKey } : {};
    },
  };
}
