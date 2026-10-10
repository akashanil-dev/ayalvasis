// The tutor's tools. Each maps onto something the system already does, and runs as the `tutor` actor,
// so the kernel's capability checks are the real limit; the autonomy level only decides which tools
// the model is offered and which capabilities the tutor is granted.

import type { KernelEvent } from '@tuxos/sdk';
import type { ActionInfo, TerminalSession, TutorAccess } from '@tuxos/system';
import type { ToolSpec } from './protocol';

export type Autonomy = 'guide' | 'demo' | 'drive';

const ORDER: Autonomy[] = ['guide', 'demo', 'drive'];

/** What the tutor may do at each level. It never gets `user:switch`, so it can never act as root. */
export const CAPABILITIES: Record<Autonomy, string[]> = {
  guide: ['fs:read', 'session:control', 'lessons:read'],
  demo: ['fs:read', 'session:control', 'lessons:read', 'shell:exec', 'fs:write'],
  drive: ['fs:read', 'session:control', 'lessons:read', 'shell:exec', 'fs:write', 'lessons:write'],
};

/** Things only the screen can do, like pointing at an icon. The desktop supplies them. */
export interface PuppetUi {
  pointAt(target: string, note?: string): void;
}

export interface Tool {
  spec: ToolSpec;
  level: Autonomy;
  run(args: Record<string, unknown>): Promise<unknown>;
}

const OUTPUT_LIMIT = 1500;
const CORE_ACTIONS = /^(fs|session|shell)\./;

export class Toolbox {
  private terminal: Promise<TerminalSession> | undefined;
  private readonly core: Tool[];

  constructor(private readonly access: TutorAccess, private readonly ui: PuppetUi) {
    this.core = this.coreTools();
  }

  /** Module tools are read fresh each time: modules load lazily and can add actions at any point. */
  private get tools(): Tool[] {
    return [...this.core, ...this.moduleTools()];
  }

  /** The tool specs offered to the model at this autonomy level. */
  specs(level: Autonomy): ToolSpec[] {
    return this.tools.filter((tool) => allows(level, tool.level)).map((tool) => tool.spec);
  }

  async call(level: Autonomy, name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((candidate) => candidate.spec.function.name === name);
    if (!tool) return { error: `There is no tool called ${name}.` };
    if (!allows(level, tool.level)) {
      return { error: `${name} needs the "${tool.level}" autonomy level; the learner set "${level}".` };
    }
    try {
      return await tool.run(args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private coreTools(): Tool[] {
    const { access } = this;
    return [
      tool('guide', 'look_at_screen', 'See the desktop: open windows (id, app, title, focus) and the apps available.',
        {}, async () => {
          const session = await access.dispatch<{ windows: { id: string; appId: string; title: string;
            minimized: boolean }[]; focusedId: string | null }>('session.list', {});
          return session.ok ? {
            windows: session.value.windows.map(({ id, appId, title, minimized }) => ({
              id, app: appId, title, minimized, focused: id === session.value.focusedId,
            })),
          } : { error: session.error.message };
        }),
      tool('guide', 'recent_activity', 'The commands the learner ran most recently, with exit codes and output.',
        { limit: { type: 'integer', description: 'How many commands, newest last (default 8, max 20).' } },
        async (args) => ({ commands: learnerCommands(access.recentEvents(400), clamp(args.limit, 8, 20)) })),
      tool('guide', 'list_directory', 'List a directory (absolute path), as the learner would see it.',
        { path: { type: 'string' } },
        async (args) => result(await access.dispatch('fs.list', { path: text(args.path) })),
        ['path']),
      tool('guide', 'read_file', 'Read a text file (absolute path). Fails where the learner may not read.',
        { path: { type: 'string' } }, async (args) => {
          const read = await access.dispatch<string>('fs.read', { path: text(args.path) });
          return read.ok ? { content: cap(read.value) } : { error: read.error.message };
        }, ['path']),
      tool('guide', 'open_app', 'Open an app window for the learner, e.g. "terminal", "files", "editor".',
        { app: { type: 'string' }, path: { type: 'string', description: 'File to open (Text Editor only).' } },
        async (args) => result(await access.openApp(text(args.app), args.path ? { path: text(args.path) } : undefined)),
        ['app']),
      tool('guide', 'point_at', 'Point at something on screen so the learner can find it.',
        {
          target: { type: 'string', description: '"app:<id>" for a desktop icon or "window:<window id>".' },
          note: { type: 'string', description: 'A few words shown next to the pointer.' },
        }, async (args) => {
          this.ui.pointAt(text(args.target), args.note === undefined ? undefined : text(args.note));
          return { ok: true };
        }, ['target']),
      tool('demo', 'run_command', 'Run a command in your own terminal to demonstrate it. You are not the learner: '
        + 'lessons do not count your commands. You cannot use sudo.',
        { command: { type: 'string' } }, async (args) => {
          const terminal = await (this.terminal ??= access.createTerminal());
          const ran = await terminal.run(text(args.command));
          return { cwd: await terminal.cwd(), exit_code: ran.code, stdout: cap(ran.stdout), stderr: cap(ran.stderr) };
        }, ['command']),
      tool('drive', 'write_file', 'Create or replace a text file (absolute path) as the learner.',
        { path: { type: 'string' }, content: { type: 'string' } },
        async (args) => result(await access.dispatch('fs.write', {
          path: text(args.path), content: text(args.content),
        })),
        ['path', 'content']),
      tool('drive', 'close_window', 'Close a window by id (from look_at_screen).',
        { window_id: { type: 'string' } },
        async (args) => result(await access.dispatch('session.close', { id: text(args.window_id) })), ['window_id']),
    ];
  }

  /** One tool per module action (e.g. a course's status and start), so new modules extend the tutor. */
  private moduleTools(): Tool[] {
    return this.access.actions()
      .filter((action) => !CORE_ACTIONS.test(action.type))
      .map((action) => {
        const params = (action.params ?? { type: 'object', properties: {} }) as Record<string, unknown>;
        return {
          level: action.mutates || action.capability.endsWith(':write') ? 'drive' : 'guide',
          spec: {
            type: 'function',
            function: { name: toolName(action), description: action.description, parameters: params },
          },
          run: async (args) => result(await this.access.dispatch(action.type, args)),
        } satisfies Tool;
      });
  }
}

function tool(
  level: Autonomy,
  name: string,
  description: string,
  properties: Record<string, unknown>,
  run: Tool['run'],
  required: string[] = [],
): Tool {
  return {
    level,
    spec: { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } },
    run,
  };
}

function allows(level: Autonomy, needed: Autonomy): boolean {
  return ORDER.indexOf(level) >= ORDER.indexOf(needed);
}

/** `learn-linux.start` becomes `learn-linux__start`: tool names allow only letters, digits, _ and -. */
export function toolName(action: ActionInfo): string {
  return action.type.replace(/\./g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function result(dispatched: { ok: true; value: unknown } | { ok: false; error: { message: string } }): unknown {
  return dispatched.ok ? { ok: true, value: dispatched.value ?? null } : { error: dispatched.error.message };
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('expected a string argument');
  return value;
}

function clamp(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

function cap(value: string): string {
  return value.length > OUTPUT_LIMIT ? `${value.slice(0, OUTPUT_LIMIT)}… (${value.length - OUTPUT_LIMIT} more)` : value;
}

export interface LearnerCommand {
  line: string;
  cwd: string;
  exit_code: number;
  stdout: string;
  stderr: string;
}

/** The learner's own commands (not the tutor's), newest last. */
export function learnerCommands(events: readonly KernelEvent[], limit: number): LearnerCommand[] {
  return events
    .filter((event) => event.ok && event.actor.kind === 'user' && event.action.type === 'shell.ran')
    .slice(-limit)
    .map((event) => {
      const ran = event.action.payload as { line: string; cwd: string; code: number; stdout: string; stderr: string };
      return { line: ran.line, cwd: ran.cwd, exit_code: ran.code, stdout: cap(ran.stdout), stderr: cap(ran.stderr) };
    });
}
