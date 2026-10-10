import type { SessionState } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import { useEffect, useState } from 'react';

interface PanelProps {
  session: SessionState;
  launcher: boolean;
  setLauncher(value: boolean): void;
  system: SystemClient;
}

export function Panel({ session, launcher, setLauncher, system }: PanelProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return <footer className="panel">
    <button aria-label="Open application launcher" onClick={() => setLauncher(!launcher)}>◈</button>
    <div className="task-list">
      {session.windows.map((window) => <button
        key={window.id}
        className={window.id === session.focusedId ? 'active' : ''}
        onClick={() => {
          const action = window.minimized || session.focusedId !== window.id
            ? 'session.focus'
            : 'session.minimize';
          void system.dispatch(action, { id: window.id });
        }}
      >{window.title}</button>)}
    </div>
    <time>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
  </footer>;
}
