import type { Kernel } from '@tuxos/kernel';
import type { Actor, CommandDefinition as SdkCommandDefinition, DispatchResult, PluginManager } from '@tuxos/sdk';
import type { CommandRegistry } from '../registry';

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface Shell {
  cwd: string;
  env: Record<string, string>;
  run(line: string): Promise<RunResult>;
  register(command: CommandDefinition): void;
  unregister(name: string): void;
  readonly plugins?: PluginManager;
  commands(): CommandDefinition[];
  /** Tab completion for the word ending at `cursor`: where it starts, and what it could become. */
  complete(line: string, cursor: number): Completion;
  /** Lines this shell has run, oldest first. */
  history(): string[];
}

export interface Completion {
  start: number;
  candidates: string[];
}

export type CommandDefinition = SdkCommandDefinition<CommandContext>;

export interface CommandContext {
  args: string[];
  stdin: string;
  user: string;
  stdout(text: string): void;
  stderr(text: string): void;
  shell: Shell;
  kernel: Kernel;
  dispatch<R>(type: string, payload: unknown): DispatchResult<R>;
  resolve(path: string): string;
}

export interface ShellInternals extends Shell {
  runAsCommand(args: string[], stdin: string, user: string): Promise<RunResult>;
}

export type ShellOptions = { actor?: Actor; registry?: CommandRegistry; plugins?: PluginManager };
