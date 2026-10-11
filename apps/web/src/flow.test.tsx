import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settings } from '../../../modules/settings/src/index';
import { about } from '../../../modules/about/src/index';
import { App } from './app';

const SLOW = { timeout: 4000 };

function memory(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
}

function system(): SystemClient {
  return createLocalSystem({
    storage: memory(),
    modules: [
      { manifest: settings.manifest, load: async () => settings },
      { manifest: about.manifest, load: async () => about },
    ],
  });
}

async function logIn(name = 'ada') {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /Log in|Next/ }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe('starting TuxOS', () => {
  it('goes from GRUB through the boot log to the login screen', async () => {
    vi.useFakeTimers();
    render(<App system={system()} />);
    expect(screen.getByText(/GNU GRUB\s+version 2\.12/)).toBeTruthy();
    expect(screen.getByRole('option', { name: /^\*TuxOS GNU\/Linux$/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'Enter' });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText(/Linux version 6\.10\.0-tuxos/)).toBeTruthy();
    for (let tick = 0; tick < 40; tick += 1) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });

  it('opens GRUB\'s advanced options and comes back', () => {
    render(<App system={system()} />);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('option', { name: /recovery mode/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('option', { name: /Memory test/ })).toBeTruthy();
  });

  it('shows the kernel\'s reason when a username is not allowed', async () => {
    render(<App system={system()} start="greeter" />);
    // The field lowercases names and drops spaces as you type, so use a character the kernel refuses.
    await logIn('bad!user');
    expect((await screen.findByRole('alert')).textContent).toContain('invalid username');
  });
});

describe('KDE Plasma', () => {
  it('logs in to Plasma with its panel, launcher and KRunner', async () => {
    render(<App system={system()} start="greeter" />);
    await logIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Application Launcher' }, SLOW));
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Categories' })).getByRole('button', { name: 'Settings' }));
    const launcher = screen.getByRole('dialog', { name: 'Application Launcher' });
    expect(launcher.textContent).toContain('Settings');
    fireEvent.change(screen.getByLabelText('Search applications'), { target: { value: 'about' } });
    expect(launcher.textContent).toContain('About this system');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Application Launcher' })).toBeNull();

    fireEvent.keyDown(window, { key: ' ', code: 'Space', altKey: true });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'sett' } });
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Close Settings' }, SLOW)).toBeTruthy();
  });

  it('switches to GNOME from Settings without logging out', async () => {
    const client = system();
    render(<App system={client} start="greeter" />);
    await logIn();
    await screen.findByRole('button', { name: 'Application Launcher' }, SLOW);
    await act(async () => { await client.openApp('settings'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to GNOME' }, SLOW));
    expect(await screen.findByRole('button', { name: 'Activities' }, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Application Launcher' })).toBeNull();
    expect((await client.session()).desktop).toBe('gnome');
  });

  it('shuts down from the Leave menu, and the power button starts it again', async () => {
    render(<App system={system()} start="greeter" />);
    await logIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }, SLOW));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Shut Down' }));
    fireEvent.click(await screen.findByRole('button', { name: /power on/ }, SLOW));
    expect(screen.getByText(/GNU GRUB\s+version 2\.12/)).toBeTruthy();
  });
});

describe('GNOME', () => {
  it('logs in through GDM to GNOME, with the Activities overview', async () => {
    const client = system();
    render(<App system={client} start="greeter" />);
    fireEvent.click(await screen.findByRole('button', { name: /Desktop Session/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /GNOME/ }));
    expect(await screen.findByText('Try without an account')).toBeTruthy();
    await logIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Activities' }, SLOW));
    expect(screen.getByText(/No open windows/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show Apps' }));
    fireEvent.click(within(document.querySelector('.gnome-app-grid') as HTMLElement).getByRole('button', { name: /Settings/ }));
    expect(await screen.findByRole('button', { name: 'Close Settings' }, SLOW)).toBeTruthy();
    // Adwaita windows have only a close button.
    expect(screen.queryByRole('button', { name: 'Minimize Settings' })).toBeNull();
    expect((await client.session()).desktop).toBe('gnome');
  });

  it('locks to GDM and unlocks the same session', async () => {
    const client = system();
    await client.boot('ada');
    await client.dispatch('session.setDesktop', { desktop: 'gnome' });
    await client.flush();
    localStorage.setItem('tuxos.last-desktop', 'gnome');
    render(<App system={client} start="greeter" />);
    // The guest saved in this browser is filled in already.
    expect((await screen.findByLabelText('Username') as HTMLInputElement).value).toBe('ada');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Activities' }, SLOW);
    fireEvent.click(screen.getByRole('button', { name: 'System menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock' }));
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ada'));
  });
});

describe('CDE', () => {
  it('logs in through dtlogin to the Front Panel, with four workspaces', async () => {
    const client = system();
    render(<App system={client} start="greeter" />);
    fireEvent.click(await screen.findByRole('button', { name: /Desktop Session/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /CDE/ }));
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    const workspaces = await screen.findByRole('group', { name: 'Workspaces' }, SLOW);
    expect(within(workspaces).getAllByRole('button')).toHaveLength(4);
    expect((await client.session()).desktop).toBe('cde');

    // A window opened on workspace One is hidden on workspace Two and back on One.
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const window = (await screen.findByText('Settings', { selector: '.window-title' }, SLOW)).closest('section')!;
    expect(window.getAttribute('aria-hidden')).toBeNull();
    fireEvent.click(within(workspaces).getByRole('button', { name: 'Two' }));
    expect(window.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(within(workspaces).getByRole('button', { name: 'One' }));
    expect(window.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('Hyprland', () => {
  it('logs in through tuigreet to Waybar, and Alt+R opens the launcher', async () => {
    const client = system();
    await client.boot('ada');
    await client.dispatch('session.setDesktop', { desktop: 'hyprland' });
    await client.flush();
    localStorage.setItem('tuxos.last-desktop', 'hyprland');
    render(<App system={client} start="greeter" />);
    expect(await screen.findByText(/Authenticate into tuxos/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Apps' }, SLOW);
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR', altKey: true });
    const launcher = await screen.findByRole('dialog', { name: 'Launcher' }, SLOW);
    fireEvent.change(within(launcher).getByLabelText('Search apps'), { target: { value: 'sett' } });
    fireEvent.keyDown(within(launcher).getByLabelText('Search apps'), { key: 'Enter' });
    // Tiled windows have no title bar buttons on a wide screen, but are still closable by keyboard.
    await screen.findByText('Settings', { selector: '.window-title' }, SLOW);
    fireEvent.keyDown(window, { key: 'c', code: 'KeyC', altKey: true });
    await waitFor(() => expect(document.querySelector('.app-window')).toBeNull());
  });

  it('lets the learner switch to any desktop from Settings, with nothing locked', async () => {
    const client = system();
    await client.boot('ada');
    await client.flush();
    localStorage.setItem('tuxos.last-desktop', 'hyprland');
    render(<App system={client} start="greeter" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }, SLOW));
    await screen.findByRole('button', { name: 'Apps' }, SLOW);
    await client.openApp('settings');
    for (const name of ['CDE', 'GNOME', 'KDE Plasma', 'Hyprland']) {
      fireEvent.click(await screen.findByRole('button', { name: `Switch to ${name}` }, SLOW));
      await screen.findByRole('button', { name: `${name}, in use` }, SLOW);
    }
  }, 20_000); // Four desktop splash screens play in a row.
});
