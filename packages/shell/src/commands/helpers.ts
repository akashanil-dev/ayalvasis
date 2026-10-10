import type { CommandContext } from './types';
import type { DispatchResult } from '@ayalvasis/sdk';

export interface Stat {
  name: string;
  kind: 'file' | 'dir';
  owner: string;
  mode: number;
  size: number;
}

export function options(ctx: CommandContext): { flags: Set<string>; args: string[] } {
  const flags = new Set<string>();
  const args: string[] = [];
  for (const arg of ctx.args) {
    if (arg.startsWith('-') && arg !== '-') {
      for (const flag of arg.slice(1)) flags.add(flag);
    } else {
      args.push(arg);
    }
  }
  return { flags, args };
}

export function stat(ctx: CommandContext, path: string): DispatchResult<Stat> {
  return ctx.dispatch<Stat>('fs.stat', { path });
}

export function read(ctx: CommandContext, path: string): string | undefined {
  const result = ctx.dispatch<string>('fs.read', { path });
  return result.ok ? result.value : undefined;
}

export function report(ctx: CommandContext, name: string, result: DispatchResult<unknown>): number {
  if (!result.ok) ctx.stderr(`${name}: ${result.error.message}\n`);
  return result.ok ? 0 : 1;
}

export function lines(text: string): string[] {
  if (!text) return [];
  const result = text.split('\n');
  if (result.at(-1) === '') result.pop();
  return result;
}

export function modeString(mode: number, kind: 'file' | 'dir'): string {
  const prefix = kind === 'dir' ? 'd' : '-';
  const permissions = [6, 3, 0].map((shift) => {
    return ['r', 'w', 'x']
      .map((character, index) => mode & (1 << (shift + 2 - index)) ? character : '-')
      .join('');
  });
  return prefix + permissions.join('');
}

export function parseMode(value: string, current = 0): number | undefined {
  if (/^[0-7]{3}$/.test(value)) return Number.parseInt(value, 8);
  const match = value.match(/^([ugoa]+)([+=-])([rwx]+)$/);
  if (!match) return undefined;
  const groups = match[1]!.includes('a') ? 'ugo' : match[1]!;
  let bits = 0;
  for (const group of groups) {
    const shift = group === 'u' ? 6 : group === 'g' ? 3 : 0;
    for (const flag of match[3]!) {
      bits |= (flag === 'r' ? 4 : flag === 'w' ? 2 : 1) << shift;
    }
  }
  if (match[2] === '+') return current | bits;
  if (match[2] === '-') return current & ~bits;
  let result = current;
  for (const group of groups) {
    const shift = group === 'u' ? 6 : group === 'g' ? 3 : 0;
    result = (result & ~(7 << shift)) | (bits & (7 << shift));
  }
  return result;
}

export function recursiveFiles(ctx: CommandContext, path: string): string[] {
  const result = ctx.dispatch<Stat[]>('fs.list', { path });
  if (!result.ok) return [];
  const files: string[] = [];
  for (const entry of result.value) {
    const child = `${path === '/' ? '' : path}/${entry.name}`;
    if (entry.kind === 'dir') files.push(...recursiveFiles(ctx, child));
    else files.push(child);
  }
  return files;
}
