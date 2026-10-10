import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useEffect, useState } from 'react';
import { useSession } from '../hooks/useSession';
import { AppIcon } from '../desktop/AppIcon';
import { Launcher } from '../desktop/Launcher';
import { Panel } from '../desktop/Panel';
import { WindowFrame } from '../desktop/WindowFrame';
import { TutorPanel } from '../tutor/TutorPanel';

export function Desktop({ system, tutor }: { system: SystemClient; tutor?: Transport }) {
  const { apps, session } = useSession(system);
  const [launcher, setLauncher] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLauncher(false);
      // The shortcut Ubuntu and most Linux desktops use to open a terminal.
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        void system.openApp('terminal');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [system]);

  const open = (appId: string) => {
    setLauncher(false);
    void system.openApp(appId);
  };

  return <main className="desktop-screen" onPointerDown={() => launcher && setLauncher(false)}>
    <div className="icon-grid">
      {apps.map((app) => <button
        className="desktop-icon"
        key={app.id}
        data-tutor-target={`app:${app.id}`}
        onDoubleClick={() => open(app.id)}
        onKeyDown={(event) => { if (event.key === 'Enter') open(app.id); }}
      >
        <AppIcon name={app.icon} />
        <span>{app.title}</span>
      </button>)}
    </div>
    {/* Minimized windows stay mounted (just hidden) so apps like Terminal keep their state. */}
    {session.windows.map((window) => <WindowFrame
      key={window.id}
      system={system}
      window={window}
      focused={session.focusedId === window.id}
    />)}
    <Panel session={session} launcher={launcher} setLauncher={setLauncher} system={system} />
    {launcher && <Launcher apps={apps} open={open} />}
    {tutor && <TutorPanel system={system} transport={tutor} />}
  </main>;
}
