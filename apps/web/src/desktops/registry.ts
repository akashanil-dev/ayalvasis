import { CdeShell } from './cde/CdeShell';
import { GnomeShell } from './gnome/GnomeShell';
import { HyprlandShell } from './hyprland/HyprlandShell';
import { PlasmaShell } from './plasma/PlasmaShell';
import type { DesktopEnvironment } from './types';

export const ENVIRONMENTS: Record<string, DesktopEnvironment> = {
  plasma: {
    id: 'plasma',
    insets: { top: 0, bottom: 44 },
    decoration: 'breeze',
    desktopIcons: 'apps',
    workspaces: null,
    tiling: false,
    Shell: PlasmaShell,
    desktopMenu: ({ open }) => [
      { label: 'Open Terminal', run: () => open('terminal') },
      { label: 'Open Files', run: () => open('files') },
      'separator',
      { label: 'Configure Desktop and Wallpaper…', run: () => open('settings') },
    ],
    welcome: 'Welcome to KDE Plasma! It works a lot like Windows: the app launcher is in the bottom-left corner, '
      + 'open apps sit in the taskbar, and the clock is on the right. Press Alt+Space to search with KRunner.',
  },
  gnome: {
    id: 'gnome',
    insets: { top: 34, bottom: 0 },
    decoration: 'adwaita',
    desktopIcons: false,
    workspaces: null,
    tiling: false,
    Shell: GnomeShell,
    desktopMenu: ({ open }) => [
      { label: 'Change Background…', run: () => open('settings') },
      { label: 'Settings', run: () => open('settings') },
    ],
    welcome: 'This is GNOME, the desktop on Fedora and Ubuntu. It keeps things calm: no desktop icons, no taskbar. '
      + 'Click Activities in the top-left corner (or push your mouse into that corner) to see your windows and apps.',
  },
  cde: {
    id: 'cde',
    insets: { top: 0, bottom: 86 },
    decoration: 'motif',
    desktopIcons: 'minimized',
    workspaces: ['One', 'Two', 'Three', 'Four'],
    tiling: false,
    Shell: CdeShell,
    // CDE's Workspace Menu lists every app.
    desktopMenu: ({ open, apps, power }) => [
      { heading: 'Workspace Menu' },
      ...apps.map((app) => ({ label: app.title, run: () => open(app.id) })),
      'separator',
      { label: 'Log out…', run: () => power('logout') },
    ],
    welcome: 'Welcome to CDE, the desktop of 1990s Unix workstations from Sun, HP and IBM. Everything lives in the '
      + 'Front Panel at the bottom, including four workspaces: put different windows on each. A minimised window '
      + 'turns into an icon on the desktop.',
  },
  hyprland: {
    id: 'hyprland',
    insets: { top: 44, bottom: 0 },
    decoration: 'borderless',
    desktopIcons: false,
    workspaces: ['1', '2', '3', '4', '5'],
    tiling: true,
    Shell: HyprlandShell,
    desktopMenu: () => [],
    welcome: 'Welcome to Hyprland, a tiling window manager. Windows arrange themselves, and you drive it from the '
      + 'keyboard: Alt+Q opens a terminal, Alt+R the app launcher, Alt+C closes a window, Alt+1 to 5 switch '
      + 'workspaces and Alt+Shift+1 to 5 move a window there.',
  },
};

export const environmentFor = (id: string): DesktopEnvironment => ENVIRONMENTS[id] ?? ENVIRONMENTS.plasma!;
