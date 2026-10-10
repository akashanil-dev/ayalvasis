// The desktop environments and wallpapers TuxOS offers. Shared by the desktop (which draws them) and the
// Settings app (which lets the learner choose), so both always agree on what exists. Every desktop is
// available from the start: nothing has to be unlocked.

export interface DesktopInfo {
  id: string;
  name: string;
  version: string;
  /** Which login screen goes with it, as on a real distribution. */
  greeter: 'sddm' | 'gdm' | 'dtlogin' | 'tuigreet';
  /** Where learners meet it in the real world. */
  usedBy: string;
  summary: string;
}

export const DESKTOPS: DesktopInfo[] = [
  {
    id: 'plasma',
    name: 'KDE Plasma',
    version: 'Plasma 6',
    greeter: 'sddm',
    usedBy: 'Kubuntu, KDE neon, Fedora KDE, SteamOS',
    summary: 'A taskbar and an app launcher, a lot like Windows.',
  },
  {
    id: 'gnome',
    name: 'GNOME',
    version: 'GNOME 47',
    greeter: 'gdm',
    usedBy: 'Ubuntu, Fedora Workstation, Debian',
    summary: 'A top bar and the Activities overview. Calm and focused.',
  },
  {
    id: 'cde',
    name: 'CDE',
    version: 'CDE 2.5',
    greeter: 'dtlogin',
    usedBy: 'Solaris, HP-UX, AIX',
    summary: 'The 1990s Unix workstation desktop, with a Front Panel and four workspaces.',
  },
  {
    id: 'hyprland',
    name: 'Hyprland',
    version: 'Hyprland 0.45',
    greeter: 'tuigreet',
    usedBy: 'Arch and other DIY setups',
    summary: 'A tiling window manager you drive from the keyboard.',
  },
];

export interface WallpaperInfo {
  id: string;
  name: string;
  /** A CSS background value for the full-size image. */
  background: string;
  /** A CSS background value for the small preview in Settings. */
  thumbnail: string;
}

const WALLPAPER_NAMES: [id: string, name: string][] = [
  ['freedom', 'Free as in freedom'],
  ['command', 'At your command'],
  ['root', 'I am root'],
  ['rabbit', 'White rabbit'],
  ['tux', 'Tux'],
  ['linus', 'Linus'],
  ['topo', 'Contours'],
  ['gnu-zen', 'GNU zen'],
  ['gnu', 'GNU'],
];

// The images live in apps/web/public/wallpapers, served from the site root.
const image = (path: string) => `#1b2224 url("/wallpapers/${path}.webp") center / cover no-repeat`;

export const WALLPAPERS: WallpaperInfo[] = WALLPAPER_NAMES.map(([id, name]) => ({
  id,
  name,
  background: image(id),
  thumbnail: image(`thumbs/${id}`),
}));

export const desktopById = (id: string): DesktopInfo => DESKTOPS.find((each) => each.id === id) ?? DESKTOPS[0]!;
/** Unknown ids (such as the gradient wallpapers of older saves) fall back to the default wallpaper. */
export const wallpaperById = (id: string): WallpaperInfo =>
  WALLPAPERS.find((each) => each.id === id) ?? WALLPAPERS[0]!;
