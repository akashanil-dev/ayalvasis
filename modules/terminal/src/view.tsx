import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { AppViewProps } from '@tuxos/system';
import { useEffect, useRef, useState } from 'react';
import { TerminalController } from './controller';
import './terminal.css';

// A GitHub-dark style palette: the same terminal colours in every desktop environment.
const THEME = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  selectionBackground: '#30363d',
  black: '#484f58',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#8b949e',
  brightRed: '#ff7b72',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

export default function TerminalView({ system, windowId }: AppViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "Ubuntu Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      scrollback: 2000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    const resize = () => {
      try {
        fit.fit();
      } catch {
        // The window can be briefly hidden (minimized) and have no size to fit to.
      }
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(element);

    let disposed = false;
    const windowActions = {
      close: () => void system.dispatch('session.close', { id: windowId }),
      setTitle: (title: string) => void system.dispatch('session.setTitle', { id: windowId, title }),
    };
    const screen = {
      write: (data: string) => term.write(data),
      clear: () => term.clear(),
      get cols() { return term.cols; },
    };
    void (async () => {
      const session = await system.createTerminal();
      if (disposed) return;
      const motd = await system.dispatch<string>('fs.read', { path: '/etc/motd' });
      const controller = new TerminalController(screen, session, windowActions);
      term.onData((data) => {
        controller.input(data).catch((cause: unknown) => setError(String(cause)));
      });
      await controller.start(motd.ok ? motd.value : undefined);
      term.focus();
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));

    return () => {
      disposed = true;
      observer?.disconnect();
      term.dispose();
    };
  }, [system, windowId]);

  return <div className="terminal-view">
    {error && <p className="terminal-error" role="alert">Terminal error: {error}</p>}
    <div className="terminal-screen" ref={container} />
  </div>;
}
