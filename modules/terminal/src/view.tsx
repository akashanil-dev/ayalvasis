import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { AppViewProps } from '@ayalvasis/system';
import { useEffect, useRef, useState } from 'react';
import { TerminalController } from './controller';
import './terminal.css';

// Tango, the palette GNOME Terminal shipped with for years.
const THEME = {
  background: '#171421',
  foreground: '#d0cfcc',
  cursor: '#d0cfcc',
  selectionBackground: '#3d3846',
  black: '#2e3436',
  red: '#cc0000',
  green: '#4e9a06',
  yellow: '#c4a000',
  blue: '#3465a4',
  magenta: '#75507b',
  cyan: '#06989a',
  white: '#d3d7cf',
  brightBlack: '#555753',
  brightRed: '#ef2929',
  brightGreen: '#8ae234',
  brightYellow: '#fce94f',
  brightBlue: '#729fcf',
  brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2',
  brightWhite: '#eeeeec',
};

export default function TerminalView({ system, windowId }: AppViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "DejaVu Sans Mono", "Ubuntu Mono", Menlo, Consolas, monospace',
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
