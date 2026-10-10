// Tab completion, bash-style: the first word of a command completes command names, every other word
// completes paths. Quoting inside the word being completed is not handled; learners rarely tab-complete
// quoted names, and a wrong guess there is harmless (it just offers nothing).

import { resolvePath, type Stat } from '@tuxos/kernel';
import type { Completion } from './commands';

export interface CompletionSource {
  cwd: string;
  home: string;
  commandNames(): string[];
  list(path: string): Stat[] | undefined;
}

const SEPARATOR = /[\s|;&<>]/;
const COMMAND_POSITION = /(^|[|;&]|sudo)\s*$/;

export function complete(source: CompletionSource, line: string, cursor: number): Completion {
  const before = line.slice(0, cursor);
  let start = before.length;
  while (start > 0 && !SEPARATOR.test(before[start - 1]!)) start -= 1;
  const word = before.slice(start);
  const isCommand = COMMAND_POSITION.test(before.slice(0, start)) && !word.includes('/');
  const candidates = isCommand ? commandCandidates(source, word) : pathCandidates(source, word);
  return { start, candidates: candidates.sort(byteOrder) };
}

function commandCandidates(source: CompletionSource, prefix: string): string[] {
  return [...new Set(source.commandNames())].filter((name) => name.startsWith(prefix));
}

function pathCandidates(source: CompletionSource, word: string): string[] {
  const slash = word.lastIndexOf('/');
  const typedDir = slash < 0 ? '' : word.slice(0, slash + 1);
  const base = word.slice(slash + 1);
  const dir = typedDir.startsWith('~') ? source.home + typedDir.slice(1) : typedDir;
  const entries = source.list(resolvePath(dir || '.', source.cwd));
  if (!entries) return [];
  return entries
    .filter((entry) => entry.name.startsWith(base))
    .filter((entry) => !entry.name.startsWith('.') || base.startsWith('.'))
    .map((entry) => typedDir + entry.name + (entry.kind === 'dir' ? '/' : ''));
}

function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
