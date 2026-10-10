import type { Kernel } from '@ayalvasis/kernel';
import type { Actor, DispatchResult } from '@ayalvasis/sdk';

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
  commands(): CommandDefinition[];
}

export interface CommandDefinition {
  name: string;
  summary: string;
  usage: string;
  run(ctx: CommandContext): Promise<number> | number;
}

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

export type ShellOptions = { actor?: Actor };
