import type { SystemClient } from '@ayalvasis/system';
import { useEffect, useState } from 'react';
import { useSession } from '../hooks/useSession';
import { Launcher } from '../desktop/Launcher';
import { Panel } from '../desktop/Panel';
import { WindowFrame } from '../desktop/WindowFrame';

export function Desktop({ system }: { system: SystemClient }) {
  const { apps, session } = useSession(system);
  const [launcher, setLauncher] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLauncher(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const open = (appId: string) => {
    setLauncher(false);
    void system.openApp(appId);
  };

  return <main className="desktop-screen" onPointerDown={() => launcher && setLauncher(false)}>
    <div className="icon-grid">
      {apps.map((app) => <button
        className="desktop-icon"
        key={app.id}
        onDoubleClick={() => open(app.id)}
        onKeyDown={(event) => { if (event.key === 'Enter') open(app.id); }}
      >
        <span className="icon-glyph">{app.icon}</span>
        <span>{app.title}</span>
      </button>)}
    </div>
    {session.windows.filter((window) => !window.minimized).map((window) => <WindowFrame
      key={window.id}
      system={system}
      window={window}
      focused={session.focusedId === window.id}
    />)}
    <Panel session={session} launcher={launcher} setLauncher={setLauncher} system={system} />
    {launcher && <Launcher apps={apps} open={open} />}
  </main>;
}
