import { Kernel, resolvePath } from '@ayalvasis/kernel';
import type { Actor, DispatchResult } from '@ayalvasis/sdk';
import { parse, type ParsedCommand, type ParsedList, type ParsedWord, type WordSegment } from './parser';
import {
  builtinCommands,
  type CommandContext,
  type CommandDefinition,
  type RunResult,
  type Shell,
  type ShellInternals,
  type ShellOptions,
} from './commands';
import { strerror } from './commands/helpers';

export class ShellImpl implements ShellInternals {
  cwd: string;
  env: Record<string, string>;
  private readonly actor?: Actor;
  private readonly definitions = new Map<string, CommandDefinition>();
  private lastStatus = 0;

  constructor(readonly kernel: Kernel, options: ShellOptions = {}) {
    this.actor = options.actor;
    this.cwd = `/home/${kernel.user}`;
    this.env = { HOME: this.cwd, USER: kernel.user, PWD: this.cwd, PATH: '/bin:/usr/bin' };
    for (const command of builtinCommands()) this.register(command);
  }

  register(command: CommandDefinition): void {
    if (this.definitions.has(command.name)) throw new Error(`command already registered: ${command.name}`);
    this.definitions.set(command.name, command);
  }

  commands(): CommandDefinition[] {
    return [...this.definitions.values()];
  }

  run(line: string): Promise<RunResult> {
    return this.runInternal(line, this.kernel.user);
  }

  async runAsCommand(args: string[], stdin: string, user: string): Promise<RunResult> {
    const definition = this.definitions.get(args[0]!);
    if (!definition) return { stdout: '', stderr: `${args[0]}: command not found\n`, code: 127 };
    return this.executeCommand(definition, args.slice(1), stdin, user);
  }

  private async runInternal(line: string, user: string): Promise<RunResult> {
    let parsed: ParsedList;
    try {
      parsed = parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bash: syntax error';
      const code = error instanceof Error && 'code' in error && typeof error.code === 'number'
        ? error.code
        : 2;
      this.lastStatus = code;
      return { stdout: '', stderr: `${message}\n`, code };
    }

    let stdout = '';
    let stderr = '';
    let code = this.lastStatus;
    for (let index = 0; index < parsed.pipelines.length; index += 1) {
      const operator = parsed.operators[index - 1];
      const shouldRun = index === 0
        || operator === ';'
        || (operator === '&&' ? code === 0 : operator === '||' ? code !== 0 : true);
      if (!shouldRun) continue;
      const result = await this.runPipeline(parsed.pipelines[index]!.commands, user);
      stdout += result.stdout;
      stderr += result.stderr;
      code = result.code;
      this.lastStatus = code;
    }
    return { stdout, stderr, code };
  }

  private async runPipeline(commands: ParsedCommand[], user: string): Promise<RunResult> {
    let input = '';
    let stderr = '';
    let code = 0;
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index]!;
      const expanded = await this.expandWords(command.words, user);
      const name = expanded[0];
      if (!name) return { stdout: '', stderr: 'bash: syntax error near unexpected token `newline`\n', code: 2 };
      const definition = this.definitions.get(name);
      if (!definition) return { stdout: '', stderr: `${name}: command not found\n`, code: 127 };
      const result = await this.executeCommand(definition, expanded.slice(1), input, user, command);
      stderr += result.stderr;
      input = result.stdout;
      code = result.code;
    }
    return { stdout: input, stderr, code };
  }

  private async executeCommand(
    definition: CommandDefinition,
    args: string[],
    stdin: string,
    user: string,
    parsed?: ParsedCommand,
  ): Promise<RunResult> {
    let stdout = '';
    let stderr = '';
    if (parsed) {
      for (const redirection of parsed.redirections) {
        if (redirection.op !== '<') continue;
        const [rawPath] = this.expandWord(redirection.word, user);
        const path = resolvePath(rawPath!, this.cwd);
        const result = this.dispatch<string>('fs.read', { path }, user);
        if (!result.ok) return { stdout: '', stderr: `bash: ${rawPath}: ${strerror(result.error.code)}\n`, code: 1 };
        stdin = result.value;
      }
    }

    const context: CommandContext = {
      args,
      stdin,
      user,
      stdout: (text) => { stdout += text; },
      stderr: (text) => { stderr += text; },
      shell: this,
      kernel: this.kernel,
      dispatch: <R>(type: string, payload: unknown) => this.dispatch<R>(type, payload, user),
      resolve: (path) => resolvePath(path, this.cwd),
    };
    const code = await definition.run(context);

    if (parsed) {
      for (const redirection of parsed.redirections) {
        if (redirection.op === '<') continue;
        const [rawPath] = this.expandWord(redirection.word, user);
        const path = resolvePath(rawPath!, this.cwd);
        const result = this.dispatch(
          'fs.write',
          { path, content: stdout, append: redirection.op === '>>' },
          user,
        );
        if (!result.ok) return { stdout: '', stderr: `bash: ${rawPath}: ${strerror(result.error.code)}\n`, code: 1 };
        stdout = '';
      }
    }
    return { stdout, stderr, code };
  }

  private dispatch<R>(type: string, payload: unknown, user: string): DispatchResult<R> {
    return this.kernel.dispatch<R>({ type, payload }, { actor: this.actor, user });
  }

  private async expandWords(words: ParsedWord[], user: string): Promise<string[]> {
    const result: string[] = [];
    for (const word of words) result.push(...this.expandWord(word, user));
    return result;
  }

  private expandWord(word: ParsedWord, user: string): string[] {
    let pattern = '';
    let hasGlob = false;
    for (const [index, segment] of word.segments.entries()) {
      const value = this.expandSegment(segment);
      if (index === 0 && segment.quoted === 'none' && segment.type === 'text' && value.startsWith('~')) {
        pattern += this.env.HOME + value.slice(1);
      } else if (segment.quoted === 'none') {
        pattern += value;
        if (/[?*]/.test(value)) hasGlob = true;
      } else {
        pattern += escapeGlob(value);
      }
    }
    return hasGlob ? this.expandGlob(pattern, user) : [unescapeGlob(pattern)];
  }

  private expandSegment(segment: WordSegment): string {
    if (segment.type === 'text') return segment.value;
    return segment.value === '?' ? String(this.lastStatus) : this.env[segment.value] ?? '';
  }

  private expandGlob(pattern: string, user: string): string[] {
    const slash = pattern.lastIndexOf('/');
    const parent = slash < 0 ? this.cwd : pattern.slice(0, slash) || '/';
    const leaf = pattern.slice(slash + 1);
    const path = resolvePath(parent, this.cwd);
    const listed = this.dispatch<{ name: string; kind: 'file' | 'dir'; owner: string; mode: number; size: number }[]>(
      'fs.list',
      { path },
      user,
    );
    if (!listed.ok) return [pattern];
    const regex = new RegExp(`^${leaf.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    const matches = listed.value
      .filter((entry) => regex.test(entry.name))
      .filter((entry) => !entry.name.startsWith('.') || leaf.startsWith('.'));
    if (!matches.length) return [pattern];
    return matches.map((entry) => unescapeGlob(pattern.startsWith('/')
      ? `${path === '/' ? '' : path}/${entry.name}`
      : `${slash < 0 ? '' : pattern.slice(0, slash + 1)}${entry.name}`));
  }
}

function escapeGlob(value: string): string {
  return value.replace(/[?*]/g, '\\$&');
}

function unescapeGlob(value: string): string {
  return value.replace(/\\([?*])/g, '$1');
}
