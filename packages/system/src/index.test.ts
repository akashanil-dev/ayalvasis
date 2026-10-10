import { describe, expect, it, vi } from 'vitest';
import { createLocalSystem, type KeyValueStorage } from './index';
import { about } from '../../../modules/about/src/index';

function storage(initial = ''): KeyValueStorage & { value: string; writes: number } {
  return {
    value: initial, writes: 0,
    async get() { return this.value || null; },
    async set(_key, value) { this.value = value; this.writes += 1; },
    async remove() { this.value = ''; },
  };
}

function system(store: KeyValueStorage) {
  return createLocalSystem({ storage: store, modules: [{ manifest: about.manifest, load: async () => about }] });
}

describe('local system client', () => {
  it('boots, exposes apps and activates an app before opening it', async () => {
    const one = storage();
    const client = system(one);
    await client.boot('ada');
    expect(await client.apps()).toEqual([expect.objectContaining({ id: 'about', moduleId: 'about' })]);
    expect(await client.openApp('about')).toEqual({ ok: true, value: 'window-1' });
    expect((await client.session()).focusedId).toBe('window-1');
    await expect((await client.createTerminal()).run('uname -a')).resolves.toMatchObject({
      code: 0,
      stdout: expect.stringContaining('Linux ayalvasis'),
    });
  });

  it('restores a save for the same username', async () => {
    vi.useFakeTimers();
    const store = storage();
    const first = system(store);
    await first.boot('ada');
    const pending = first.dispatch('session.open', { appId: 'about', title: 'About' });
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    const second = system(store); await second.boot('ada');
    expect((await second.session()).windows).toHaveLength(1);
    vi.useRealTimers();
  });

  it('debounces writes and rejects persistence failures', async () => {
    vi.useFakeTimers();
    const store = storage();
    const set = store.set;
    store.set = async function (...args) { await set.apply(this, args); };
    const client = system(store); await client.boot('ada');
    const pending = client.dispatch('session.open', { appId: 'x', title: 'X' });
    expect(store.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(499); expect(store.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(1); await pending; expect(store.writes).toBe(1);
    vi.useRealTimers();
  });

  it('surfaces a storage write failure through dispatch', async () => {
    vi.useFakeTimers();
    const store = storage();
    store.set = async () => { throw new Error('storage unavailable'); };
    const client = system(store); await client.boot('ada');
    const pending = client.dispatch('session.open', { appId: 'x', title: 'X' });
    const failure = expect(pending).rejects.toThrow('storage unavailable');
    await vi.advanceTimersByTimeAsync(500);
    await failure;
    vi.useRealTimers();
  });
});
