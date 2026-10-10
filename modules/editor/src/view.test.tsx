import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@ayalvasis/system';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editor } from './index';
import EditorView from './view';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function boot(): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(),
    modules: [{ manifest: editor.manifest, load: async () => editor }],
  });
  await system.boot('ada');
  await system.dispatch('session.open', { appId: 'editor', title: 'Text Editor' });
  return system;
}

const title = async (system: SystemClient) => (await system.session()).windows[0]?.title;
const area = () => screen.getByLabelText<HTMLTextAreaElement>('File contents');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Text Editor', () => {
  it('loads a file, marks it dirty when edited, and saves with Ctrl+S', async () => {
    const system = await boot();
    await system.dispatch('fs.write', { path: '/home/ada/todo.txt', content: 'learn ls\n' });
    render(<EditorView system={system} windowId="window-1" args={{ path: '/home/ada/todo.txt' }} />);
    await waitFor(() => expect(area().value).toBe('learn ls\n'));
    await waitFor(async () => expect(await title(system)).toBe('todo.txt — Text Editor'));

    fireEvent.change(area(), { target: { value: 'learn ls\nlearn grep\n' } });
    await waitFor(async () => expect(await title(system)).toBe('• todo.txt — Text Editor'));
    fireEvent.keyDown(area(), { key: 's', ctrlKey: true });
    await waitFor(async () => expect(await title(system)).toBe('todo.txt — Text Editor'));
    expect(await system.dispatch('fs.read', { path: '/home/ada/todo.txt' })).toEqual({
      ok: true, value: 'learn ls\nlearn grep\n',
    });
  });

  it('explains a permission error and suggests sudo', async () => {
    const system = await boot();
    render(<EditorView system={system} windowId="window-1" args={{ path: '/etc/hostname' }} />);
    await waitFor(() => expect(area().value).toBe('ayalvasis'));
    fireEvent.change(area(), { target: { value: 'my-box' } });
    fireEvent.keyDown(area(), { key: 's', ctrlKey: true });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Couldn’t save “/etc/hostname”: Permission denied');
    expect(alert.textContent).toContain('try sudo');
  });

  it('asks where to save an untitled document', async () => {
    const system = await boot();
    render(<EditorView system={system} windowId="window-1" />);
    fireEvent.change(area(), { target: { value: 'new notes' } });
    fireEvent.keyDown(area(), { key: 's', ctrlKey: true });
    const input = await screen.findByLabelText<HTMLInputElement>('Save as');
    expect(input.value).toBe('/home/ada/untitled.txt');
    fireEvent.change(input, { target: { value: '/home/ada/notes.txt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect(await system.dispatch('fs.read', { path: '/home/ada/notes.txt' }))
      .toEqual({ ok: true, value: 'new notes' }));
  });

  it('guards closing only while there are unsaved changes', async () => {
    const system = await boot();
    let guard: (() => boolean) | null = null;
    render(<EditorView system={system} windowId="window-1" setCloseGuard={(next) => { guard = next; }} />);
    expect(guard).toBeNull();
    fireEvent.change(area(), { target: { value: 'draft' } });
    await waitFor(() => expect(guard).not.toBeNull());
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    expect(guard!()).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?');
  });

  it('opens a missing file as empty, so saving creates it', async () => {
    const system = await boot();
    render(<EditorView system={system} windowId="window-1" args={{ path: '/home/ada/new.txt' }} />);
    await waitFor(async () => expect(await title(system)).toBe('new.txt — Text Editor'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
