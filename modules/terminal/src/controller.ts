// Connects a screen (xterm.js in the app, a fake in tests) to one shell session: prompt, line editing,
// running commands, completion, and the few things bash itself handles rather than a program (exit).

import type { TerminalSession } from '@ayalvasis/system';
import { LineEditor, type EditorEvent } from './line-editor';

export interface Screen {
  write(data: string): void;
  clear(): void;
  readonly cols: number;
}

export interface WindowActions {
  close(): void;
  setTitle(title: string): void;
}

const EXIT = /^\s*exit(\s+\d+)?\s*$/;

export class TerminalController {
  private readonly editor = new LineEditor();
  private busy = true;
  private pending = '';
  private title = '';

  constructor(
    private readonly screen: Screen,
    private readonly session: TerminalSession,
    private readonly window: WindowActions,
  ) {}

  async start(motd?: string): Promise<void> {
    if (motd) this.screen.write(toTerminal(motd.endsWith('\n') ? motd : `${motd}\n`));
    await this.showPrompt();
  }

  /** Keystrokes typed while a command runs are kept and replayed at the next prompt, like a real tty. */
  async input(data: string): Promise<void> {
    if (this.busy) {
      this.pending += data;
      return;
    }
    const { output, events } = this.editor.input(data);
    this.screen.write(output);
    for (const event of events) await this.handle(event);
  }

  private async handle(event: EditorEvent): Promise<void> {
    switch (event.type) {
      case 'submit':
        return this.submit(event.line);
      case 'interrupt':
        return this.showPrompt();
      case 'clear-screen':
        this.screen.clear();
        this.screen.write(this.editor.redraw());
        return;
      case 'eof':
        this.screen.write('exit\r\n');
        this.window.close();
        return;
      case 'complete': {
        const completion = await this.session.complete(event.line, event.cursor);
        this.screen.write(this.editor.applyCompletion(completion, this.screen.cols));
      }
    }
  }

  private async submit(line: string): Promise<void> {
    if (EXIT.test(line)) {
      this.window.close();
      return;
    }
    this.busy = true;
    const result = await this.session.run(line);
    this.screen.write(toTerminal(result.stdout + result.stderr));
    await this.showPrompt();
  }

  private async showPrompt(): Promise<void> {
    this.busy = true;
    const prompt = await this.session.prompt();
    this.screen.write(this.editor.start(prompt, await this.session.history()));
    const title = titleFor(prompt);
    if (title !== this.title) this.window.setTitle((this.title = title));
    this.busy = false;
    if (this.pending) {
      const typed = this.pending;
      this.pending = '';
      await this.input(typed);
    }
  }
}

/** xterm needs \r\n to return to the start of the line; programs print plain \n. */
export function toTerminal(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

/** `ada@ayalvasis:~/src$ ` becomes the window title `ada@ayalvasis: ~/src`, as GNOME Terminal shows it. */
export function titleFor(prompt: string): string {
  const match = /^(.*?):(.*)[$#] $/.exec(prompt);
  return match ? `${match[1]}: ${match[2]}` : 'Terminal';
}
