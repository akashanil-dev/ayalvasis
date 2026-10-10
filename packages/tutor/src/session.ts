// One conversation with the tutor. Each question is sent with a fresh snapshot of what the learner
// is doing; the model may call tools, whose results go back to it, until it answers in words.

import type { TutorAccess } from '@tuxos/system';
import type { ChatMessage, ToolCall, Transport } from './protocol';
import { learnerCommands, Toolbox, type PuppetUi } from './tools';

export type TutorEvent =
  | { type: 'message'; role: 'user' | 'assistant'; text: string }
  | { type: 'tool'; name: string; args: Record<string, unknown>; result: unknown }
  | { type: 'busy'; busy: boolean }
  | { type: 'error'; message: string };

/** Stop runaway loops: a single question may use at most this many model calls. */
const MAX_ROUNDS = 16;
/** Older turns are dropped to keep requests small; the snapshot covers the current state anyway. */
const HISTORY_LIMIT = 30;

export interface TutorOptions {
  access: TutorAccess;
  transport: Transport;
  ui: PuppetUi;
}

export class TutorSession {
  private history: ChatMessage[] = [];
  private busy = false;
  private stopped = false;
  private readonly toolbox: Toolbox;
  private readonly listeners = new Set<(event: TutorEvent) => void>();

  constructor(private readonly options: TutorOptions) {
    this.toolbox = new Toolbox(options.access, options.ui);
  }

  get hasSudo(): boolean {
    return this.toolbox.hasSudo;
  }

  revokeSudo(): void {
    this.toolbox.revokeSudo();
  }

  /** The learner takes back control: no more tool calls or model rounds for the current question. */
  stop(): void {
    if (this.busy) this.stopped = true;
  }

  on(listener: (event: TutorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async ask(question: string): Promise<void> {
    if (this.busy) throw new Error('The tutor is still answering the previous question.');
    const text = question.trim();
    if (!text) return;
    this.stopped = false;
    this.setBusy(true);
    this.emit({ type: 'message', role: 'user', text });
    this.history.push({ role: 'user', content: text });
    try {
      await this.converse();
    } catch (error) {
      this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.setBusy(false);
    }
  }

  private async converse(): Promise<void> {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const reply = await this.options.transport.complete({
        messages: this.request(),
        tools: this.toolbox.specs(),
      });
      if (this.stopped) return this.halt();
      this.history.push(reply);
      if (reply.content) this.emit({ type: 'message', role: 'assistant', text: reply.content });
      if (!reply.tool_calls?.length) return;
      for (const call of reply.tool_calls) this.history.push(await this.runTool(call));
      if (this.stopped) return this.halt();
    }
    this.emit({ type: 'error', message: 'The tutor took too many steps on that one. Try asking more specifically.' });
  }

  /** Stopped mid-answer: leave the conversation in a shape the model accepts next time. */
  private halt(): void {
    const last = this.history.at(-1);
    if (last?.role === 'assistant' && last.tool_calls?.length) this.history.pop();
    this.history.push({ role: 'assistant', content: '(The learner pressed Stop and took back control.)' });
    this.emit({ type: 'error', message: 'Stopped. You have control again.' });
  }

  private async runTool(call: ToolCall): Promise<ChatMessage> {
    let args: Record<string, unknown> = {};
    let result: unknown;
    try {
      args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      result = this.stopped
        ? { error: 'The learner pressed Stop.' }
        : await this.toolbox.call(call.function.name, args);
    } catch {
      result = { error: 'The tool arguments were not valid JSON.' };
    }
    this.emit({ type: 'tool', name: call.function.name, args, result });
    return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) };
  }

  /** The conversation as sent: recent turns, with a snapshot of the system added to the last question. */
  private request(): ChatMessage[] {
    let start = Math.max(0, this.history.length - HISTORY_LIMIT);
    // Never start mid-exchange: a tool result must follow the assistant message that asked for it.
    while (start < this.history.length && this.history[start]!.role !== 'user') start += 1;
    // A long answer with many tool calls may itself exceed the limit: always keep the current question.
    const current = this.history.map((message) => message.role).lastIndexOf('user');
    if (current >= 0) start = Math.min(start, current);
    const recent = this.history.slice(start);
    const lastQuestion = recent.map((message) => message.role).lastIndexOf('user');
    return recent.map((message, index) => index === lastQuestion && message.role === 'user'
      ? { role: 'user', content: `${message.content}\n\n${this.snapshot()}` }
      : message);
  }

  private snapshot(): string {
    const commands = learnerCommands(this.options.access.recentEvents(400), 5);
    const lines = [
      '<system_snapshot>',
      `Sudo: ${this.toolbox.hasSudo ? 'granted by the learner' : 'not granted (use request_sudo if you need it)'}.`,
      'Learner\'s latest commands (oldest first):',
      ...(commands.length
        ? commands.map((cmd) => `  [${cmd.cwd}] $ ${cmd.line}  -> exit ${cmd.exit_code}`
          + (cmd.stderr ? `, error: ${cmd.stderr.trim().split('\n')[0]}` : ''))
        : ['  (none yet)']),
      '</system_snapshot>',
    ];
    return lines.join('\n');
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.emit({ type: 'busy', busy });
  }

  private emit(event: TutorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
