import { GnomeShell } from './gnome/GnomeShell';
import { PlasmaShell } from './plasma/PlasmaShell';
import type { DesktopEnvironment } from './types';

export const ENVIRONMENTS: Record<string, DesktopEnvironment> = {
  plasma: {
    id: 'plasma',
    insets: { top: 0, bottom: 44 },
    decoration: 'breeze',
    desktopIcons: true,
    Shell: PlasmaShell,
    desktopMenu: ({ open }) => [
      { label: 'Open Terminal Here', run: () => open('terminal') },
      { label: 'Open Files', run: () => open('files') },
      'separator',
      { label: 'Configure Desktop and Wallpaper…', run: () => open('settings') },
    ],
    welcome: 'Welcome to KDE Plasma! The app launcher is in the bottom-left corner, open apps live in the taskbar, '
      + 'and Alt+Space searches for anything.',
  },
  gnome: {
    id: 'gnome',
    insets: { top: 32, bottom: 0 },
    decoration: 'adwaita',
    desktopIcons: false,
    Shell: GnomeShell,
    desktopMenu: ({ open }) => [
      { label: 'Change Background…', run: () => open('settings') },
      { label: 'Settings', run: () => open('settings') },
    ],
    welcome: 'Welcome to GNOME! Click Activities (or press the Super key, or push the pointer into the top-left corner) '
      + 'to see your windows and apps.',
  },
};

export const environmentFor = (id: string): DesktopEnvironment => ENVIRONMENTS[id] ?? ENVIRONMENTS.plasma!;
