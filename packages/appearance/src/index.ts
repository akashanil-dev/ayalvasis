// The desktop environments and wallpapers TuxOS offers. Shared by the desktop (which draws them) and the
// Settings app (which lets the learner choose), so both always agree on what exists.

export interface DesktopInfo {
  id: string;
  name: string;
  /** Which login screen goes with it, as on a real distribution. */
  greeter: 'sddm' | 'gdm';
  /** Where learners meet it in the real world. */
  usedBy: string;
  summary: string;
}

export const DESKTOPS: DesktopInfo[] = [
  {
    id: 'plasma',
    name: 'KDE Plasma',
    greeter: 'sddm',
    usedBy: 'Kubuntu, KDE neon, Fedora KDE, SteamOS desktop mode',
    summary: 'A taskbar at the bottom, an app launcher in the corner and icons on the desktop. '
      + 'Feels familiar if you come from Windows.',
  },
  {
    id: 'gnome',
    name: 'GNOME',
    greeter: 'gdm',
    usedBy: 'Ubuntu, Fedora Workstation, Debian',
    summary: 'A calm top bar and the Activities overview for finding windows and apps. '
      + 'No desktop icons, no taskbar.',
  },
];

export interface WallpaperInfo {
  id: string;
  name: string;
  /** A CSS background value: gradients only, so wallpapers cost no downloads. */
  background: string;
}

export const WALLPAPERS: WallpaperInfo[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    background: 'radial-gradient(ellipse at 20% 110%, #1b9e77aa 0%, transparent 55%), '
      + 'radial-gradient(ellipse at 80% -10%, #7b5ce0aa 0%, transparent 55%), '
      + 'linear-gradient(160deg, #0b1026 0%, #14234a 55%, #0d2a3a 100%)',
  },
  {
    id: 'dunes',
    name: 'Dunes',
    background: 'radial-gradient(ellipse at 70% 120%, #e9864c 0%, transparent 60%), '
      + 'linear-gradient(175deg, #3a1c4f 0%, #b44d5c 55%, #f0a35e 100%)',
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    background: 'radial-gradient(circle at 30% 30%, #1c71d8 0%, transparent 45%), '
      + 'radial-gradient(circle at 75% 70%, #0b8f8f 0%, transparent 50%), linear-gradient(135deg, #061230, #021b2b)',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: 'radial-gradient(ellipse at 50% 120%, #2ec27e88 0%, transparent 60%), '
      + 'linear-gradient(180deg, #0f2a1d 0%, #163d2b 50%, #0b1f17 100%)',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    background: 'radial-gradient(circle at 50% 40%, #3d3846 0%, #241f31 60%, #1a1622 100%)',
  },
];

export const desktopById = (id: string): DesktopInfo => DESKTOPS.find((each) => each.id === id) ?? DESKTOPS[0]!;
export const wallpaperById = (id: string): WallpaperInfo =>
  WALLPAPERS.find((each) => each.id === id) ?? WALLPAPERS[0]!;
