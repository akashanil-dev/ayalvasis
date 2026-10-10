import { describe, expect, it } from 'vitest';
import { createLocalSystem, type KeyValueStorage } from '@ayalvasis/system';
import { TerminalController, titleFor, toTerminal } from './controller';
import { terminal } from './index';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function setup() {
  const system = createLocalSystem({
    storage: memory(),
    modules: [{ manifest: terminal.manifest, load: async () => terminal }],
  });
  await system.boot('ada');
  let output = '';
  let cleared = 0;
  const window = { closed: false, titles: [] as string[] };
  const screen = { write: (data: string) => { output += data; }, clear: () => { cleared += 1; }, cols: 80 };
  const controller = new TerminalController(screen, await system.createTerminal(), {
    close: () => { window.closed = true; },
    setTitle: (title) => window.titles.push(title),
  });
  return { controller, window, read: () => output, reset: () => { output = ''; }, cleared: () => cleared };
}

describe('TerminalController', () => {
  it('prints the motd and a bash prompt, and titles the window', async () => {
    const { controller, window, read } = await setup();
    await controller.start('Welcome');
    expect(read()).toBe('Welcome\r\nada@ayalvasis:~$ ');
    expect(window.titles).toEqual(['ada@ayalvasis: ~']);
  });

  it('runs a typed command and shows its output with terminal line endings', async () => {
    const { controller, read, reset } = await setup();
    await controller.start();
    reset();
    await controller.input('echo hi > f; cat f; cat nope\r');
    expect(read()).toContain('\r\nhi\r\ncat: nope: No such file or directory\r\nada@ayalvasis:~$ ');
  });

  it('updates the prompt and title after cd', async () => {
    const { controller, window, read } = await setup();
    await controller.start();
    await controller.input('cd Documents\r');
    expect(read().endsWith('ada@ayalvasis:~/Documents$ ')).toBe(true);
    expect(window.titles).toEqual(['ada@ayalvasis: ~', 'ada@ayalvasis: ~/Documents']);
    await controller.input('ls\r');
    expect(window.titles).toHaveLength(2);
  });

  it('completes with Tab through the shell', async () => {
    const { controller, read } = await setup();
    await controller.start();
    await controller.input('cd Doc\t');
    expect(read().endsWith('cd Documents/\x1b[K')).toBe(true);
  });

  it('closes the window on exit and on Ctrl+D at an empty prompt', async () => {
    const first = await setup();
    await first.controller.start();
    await first.controller.input('exit\r');
    expect(first.window.closed).toBe(true);

    const second = await setup();
    await second.controller.start();
    await second.controller.input('\x04');
    expect(second.window.closed).toBe(true);
  });

  it('clears the screen with Ctrl+L and with the clear command from this module', async () => {
    const { controller, read, cleared } = await setup();
    await controller.start();
    await controller.input('\x0c');
    expect(cleared()).toBe(1);
    await controller.input('clear\r');
    expect(read()).toContain('\x1b[H\x1b[2J\x1b[3J');
  });

  it('gives a fresh prompt on Ctrl+C', async () => {
    const { controller, read, reset } = await setup();
    await controller.start();
    reset();
    await controller.input('half typed\x03');
    expect(read().endsWith('^C\r\nada@ayalvasis:~$ ')).toBe(true);
  });
});

describe('helpers', () => {
  it('converts newlines for xterm', () => {
    expect(toTerminal('a\nb\r\nc')).toBe('a\r\nb\r\nc');
  });

  it('turns a prompt into a window title', () => {
    expect(titleFor('root@box:/etc# ')).toBe('root@box: /etc');
    expect(titleFor('weird')).toBe('Terminal');
  });
});
