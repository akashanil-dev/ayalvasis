// The login screen appears before the system boots, so it can't read the saved session. Like a display
// manager remembering the last session, the browser keeps the last desktop and wallpaper for it.

const DESKTOP_KEY = 'tuxos.last-desktop';
const WALLPAPER_KEY = 'tuxos.last-wallpaper';

export function rememberAppearance(desktop: string, wallpaper: string): void {
  try {
    localStorage.setItem(DESKTOP_KEY, desktop);
    localStorage.setItem(WALLPAPER_KEY, wallpaper);
  } catch {
    // Not remembering only means the login screen uses the defaults.
  }
}

export function lastAppearance(): { desktop: string | null; wallpaper: string | null } {
  try {
    return { desktop: localStorage.getItem(DESKTOP_KEY), wallpaper: localStorage.getItem(WALLPAPER_KEY) };
  } catch {
    return { desktop: null, wallpaper: null };
  }
}
