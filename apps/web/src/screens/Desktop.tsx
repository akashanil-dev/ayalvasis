import { wallpaperById } from '@tuxos/appearance';
import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useCallback, useEffect, useState } from 'react';
import { SessionSplash } from '../boot/PowerScreens';
import { AppIcon } from '../desktop/AppIcon';
import { WindowFrame } from '../desktop/WindowFrame';
import { environmentFor } from '../desktops/registry';
import { PopupMenu } from '../desktops/shared/Menu';
import type { PowerAction } from '../desktops/types';
import { useSession } from '../hooks/useSession';
import { TutorPanel } from '../tutor/TutorPanel';
import { rememberAppearance } from './appearance-memory';

/**
 * The desktop: wallpaper, desktop icons, windows, and the current desktop environment's shell.
 * Switching environment (from Settings, or by the tutor) shows that environment's splash, then its shell.
 */
export function Desktop({ system, tutor, onPower }: {
  system: SystemClient;
  tutor?: Transport;
  onPower?(action: PowerAction): void;
}) {
  const { apps, session, user, loaded } = useSession(system);
  const environment = environmentFor(session.desktop);
  // The environment currently drawn; null until the first splash has played.
  const [shown, setShown] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [launcherRequest, setLauncherRequest] = useState(0);
  const [welcome, setWelcome] = useState<string | null>(null);

  const open = useCallback((appId: string) => void system.openApp(appId), [system]);
  const activate = useCallback((id: string) => void system.dispatch('session.focus', { id }), [system]);
  const minimize = useCallback((id: string) => void system.dispatch('session.minimize', { id }), [system]);
  const power = useCallback((action: PowerAction) => onPower?.(action), [onPower]);

  useEffect(() => rememberAppearance(session.desktop, session.wallpaper), [session.desktop, session.wallpaper]);

  useEffect(() => {
    if (shown === session.desktop) setWelcome(firstVisitWelcome(session.desktop, environment.welcome));
  }, [shown, session.desktop, environment.welcome]);

  useEffect(() => {
    let superAlone = false;
    const down = (event: KeyboardEvent) => {
      superAlone = event.key === 'Meta' || event.key === 'OS';
      // Ctrl+Alt+T opens a terminal on most Linux desktops.
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        open('terminal');
      }
    };
    // Tapping the Super (Windows) key on its own opens the launcher or overview.
    const up = (event: KeyboardEvent) => {
      if ((event.key === 'Meta' || event.key === 'OS') && superAlone) setLauncherRequest((count) => count + 1);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [open]);

  if (!loaded) return <main className="splash splash-gnome" />;
  if (shown !== session.desktop) {
    return <SessionSplash desktop={session.desktop} onDone={() => setShown(session.desktop)} />;
  }

  const { Shell } = environment;
  return <main
    className={`desktop-screen de-${environment.id}`}
    style={{ background: wallpaperById(session.wallpaper).background }}
    onContextMenu={(event) => {
      if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains('icon-grid')) return;
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY });
    }}
  >
    {environment.desktopIcons && <div className="icon-grid" style={{ top: environment.insets.top + 12 }}>
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
    </div>}
    {/* Minimized windows stay mounted (just hidden) so apps like Terminal keep their state. */}
    {session.windows.map((window) => {
      const app = apps.find((each) => each.id === window.appId);
      return <WindowFrame
        key={window.id}
        system={system}
        window={window}
        focused={session.focusedId === window.id}
        insets={environment.insets}
        decoration={environment.decoration}
        icon={app && <AppIcon name={app.icon} />}
      />;
    })}
    <Shell
      system={system}
      apps={apps}
      session={session}
      user={user}
      open={open}
      activate={activate}
      minimize={minimize}
      power={power}
      launcherRequest={launcherRequest}
    />
    {menu && <PopupMenu x={menu.x} y={menu.y} items={environment.desktopMenu({ open })} onClose={() => setMenu(null)} />}
    {welcome && <div className={`notification notification-${environment.id}`} role="status">
      <strong>Welcome</strong>
      <p>{welcome}</p>
      <button aria-label="Dismiss" onClick={() => setWelcome(null)}>×</button>
    </div>}
    {tutor && <TutorPanel system={system} transport={tutor} />}
  </main>;
}

/** The welcome note is shown once per desktop environment, in this browser. */
function firstVisitWelcome(desktop: string, text: string): string | null {
  const key = `tuxos.welcomed.${desktop}`;
  try {
    if (localStorage.getItem(key)) return null;
    localStorage.setItem(key, '1');
  } catch {
    // Without storage the note just shows each time, which is harmless.
  }
  return text;
}
