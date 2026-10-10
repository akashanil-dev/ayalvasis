import type { Actor } from '@tuxos/sdk';
import type { Kernel } from '@tuxos/kernel';
import { ShellImpl } from './executor';
import type { Shell } from './commands';
import type { CommandRegistry } from './registry';
export type { CommandContext, CommandDefinition, Completion, RunResult, Shell, ShellOptions } from './commands';
export { createCommandRegistry, type CommandRegistry } from './registry';

export function createShell(kernel: Kernel, options: { actor?: Actor; registry?: CommandRegistry } = {}): Shell {
  return new ShellImpl(kernel, options);
}
