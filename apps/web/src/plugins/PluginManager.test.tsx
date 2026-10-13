import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createLocalSystem, type SystemClient } from '@tuxos/system';
import PluginManagerView from './PluginManager';
import { STARTER_PLUGIN } from './catalog';
import { useSession } from '../hooks/useSession';

let system: SystemClient;
beforeEach(async () => {
  const values = new Map<string, string>();
  system = createLocalSystem({ modules: [], storage: { get: async k => values.get(k) ?? null, set: async(k,v)=>{values.set(k,v);}, remove: async k=>{values.delete(k);} } });
  await system.boot('ada');
});
afterEach(async () => { cleanup(); await system.reset(); vi.restoreAllMocks(); });

function Harness() {
  const { apps } = useSession(system);
  return <><output data-testid="launcher-apps">{apps.map(app => app.id).join(',')}</output><PluginManagerView system={system} windowId="manager" /></>;
}

async function approve(button = 'Install plugin') {
  const dialog = await screen.findByRole('dialog');
  expect((within(dialog).getByRole('button', { name: button }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /I trust this plugin/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('graphical plugin management', () => {
  it('shows the available catalog, searches and filters without installing anything', async () => {
    render(<Harness />);
    expect(await screen.findByRole('heading', { name: 'Available plugins' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Install plugin/ })).toHaveLength(3);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search plugins' }), { target: { value: 'timer' } });
    expect(screen.getByRole('heading', { name: 'Focus Timer' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Quick Notes' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Learning' }));
    expect(screen.getByRole('heading', { name: 'Permission Explorer' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Focus Timer' })).toBeNull();
    expect(await system.plugins!().list()).toEqual([]);
  });

  it('reviews permission access, updates the live launcher, opens, disables, enables and removes a plugin', async () => {
    render(<Harness />);
    await waitFor(() => expect((screen.getAllByRole('button', { name: /Install plugin/ })[0] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: /Install plugin/ })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Read files in this plugin’s private storage')).toBeDefined();
    expect(await system.plugins!().list()).toEqual([]);
    await approve();
    await waitFor(() => expect(screen.getByTestId('launcher-apps').textContent).toContain('quick-notes'));
    fireEvent.click(screen.getByRole('button', { name: 'Open plugin' }));
    await waitFor(async () => expect((await system.session()).windows[0]?.appId).toBe('quick-notes'));
    fireEvent.click(screen.getByRole('button', { name: /Installed/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(screen.getByTestId('launcher-apps').textContent).toBe(''));
    expect((await system.session()).windows).toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Review & enable' }));
    await approve('Enable plugin');
    await waitFor(() => expect(screen.getByTestId('launcher-apps').textContent).toContain('quick-notes'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const removal = await screen.findByRole('dialog');
    expect((within(removal).getByRole('checkbox', { name: /Also delete/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(removal).getByRole('button', { name: 'Remove plugin' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await system.plugins!().list()).toEqual([]);
    expect(screen.getByTestId('launcher-apps').textContent).toBe('');
  });

  it('validates imports, loads a starter template and requires review for replacements', async () => {
    render(<Harness />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Plugin manager' })).getByRole('button', { name: /Add your own/ }));
    const input = screen.getByRole('textbox', { name: 'Package JSON' });
    fireEvent.change(input, { target: { value: '{broken' } });
    fireEvent.click(screen.getByRole('button', { name: /Review package/ }));
    expect(await screen.findByRole('alert')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Use template' }));
    expect((input as HTMLTextAreaElement).value).toContain('my-plugin');
    fireEvent.click(screen.getByRole('button', { name: /Review package/ }));
    await approve();
    expect((await system.apps())[0]?.id).toBe('my-plugin-app');
    const update = { ...STARTER_PLUGIN, manifest: { ...STARTER_PLUGIN.manifest, version: '1.1.0' } };
    fireEvent.change(input, { target: { value: JSON.stringify(update) } });
    fireEvent.click(screen.getByRole('button', { name: /Review package/ }));
    expect(await screen.findByRole('heading', { name: 'Review plugin update' })).toBeDefined();
    await approve('Update plugin');
    expect((await system.plugins!().export('my-plugin')).manifest.version).toBe('1.1.0');
  });

  it('cancels permission review with Escape without changing the system', async () => {
    render(<Harness />);
    await waitFor(() => expect((screen.getAllByRole('button', { name: /Install plugin/ })[0] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: /Install plugin/ })[0]!);
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await system.plugins!().list()).toEqual([]);
  });

  it('surfaces a permissionless custom package without executing it during review', async () => {
    render(<Harness />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Plugin manager' })).getByRole('button', { name: /Add your own/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Package JSON' }), { target: { value: JSON.stringify({ ...STARTER_PLUGIN, html: '<script>window.packageExecuted=true</script>' }) } });
    fireEvent.click(screen.getByRole('button', { name: /Review package/ }));
    expect(await screen.findByText('No storage permissions. This plugin works entirely inside its window.')).toBeDefined();
    expect(window).not.toHaveProperty('packageExecuted');
  });
});
