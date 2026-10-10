import type { Actor } from '@ayalvasis/sdk';
import type { Kernel } from '@ayalvasis/kernel';
import { ShellImpl } from './executor';
import type { Shell } from './commands';
export type { CommandContext, CommandDefinition, RunResult, Shell, ShellOptions } from './commands';

export function createShell(kernel: Kernel, options: { actor?: Actor } = {}): Shell {
  return new ShellImpl(kernel, options);
}
