import type { Stat } from '@tuxos/kernel';

/** Why a new file or folder name is unusable, or null if it is fine. Mirrors what Linux itself forbids. */
export function nameError(name: string): string | null {
  if (!name.trim()) return 'The name cannot be empty.';
  if (name.includes('/')) return 'Names cannot contain “/”: it separates folders in a path.';
  if (name === '.' || name === '..') return '“.” and “..” are special names for this folder and its parent.';
  if (name.length > 255) return 'Names can be at most 255 characters long.';
  return null;
}

/** Folders first, then files, each in byte order like `ls`. */
export function sortEntries(entries: Stat[], showHidden: boolean): Stat[] {
  return entries
    .filter((entry) => showHidden || !entry.name.startsWith('.'))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
}

export function formatSize(entry: Stat): string {
  if (entry.kind === 'dir') return '—';
  if (entry.size < 1000) return `${entry.size} bytes`;
  if (entry.size < 1_000_000) return `${(entry.size / 1000).toFixed(1)} kB`;
  return `${(entry.size / 1_000_000).toFixed(1)} MB`;
}

export function formatTime(mtime: number, now = Date.now()): string {
  const date = new Date(mtime);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

export function parentOf(path: string): string {
  if (path === '/') return '/';
  return path.slice(0, path.lastIndexOf('/')) || '/';
}
