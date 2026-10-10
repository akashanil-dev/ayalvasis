import { useEffect, useState } from 'react';
import { AppIcon } from '../../desktop/AppIcon';
import { useNow } from '../shared/Clock';
import { activateApp } from '../shared/activate-app';
import { Icon } from '../shared/Icons';
import { PopupMenu } from '../shared/Menu';
import type { ShellProps } from '../types';
import './cde.css';

/** Apps on the Front Panel, either side of the workspace switch. */
const LEFT = ['terminal', 'files', 'editor'];
const RIGHT = ['learn-linux', 'learn-docker', 'chmod-arcade', 'settings'];
const WORKSPACES = ['One', 'Two', 'Three', 'Four'];

/** CDE's Front Panel: clock, calendar, app launchers and the workspace switch with Lock and Exit. */
export function CdeShell(props: ShellProps) {
  const { apps, open, power, launcherRequest, workspace, switchWorkspace } = props;
  const [menu, setMenu] = useState(false);
  const now = useNow();

  useEffect(() => { if (launcherRequest) setMenu((value) => !value); }, [launcherRequest]);

  const launcher = (appId: string) => {
    const app = apps.find((each) => each.id === appId);
    if (!app) return null;
    return <button
      key={appId}
      className="cde-tile cde-launch"
      title={app.title}
      aria-label={app.title}
      data-tutor-target={`task:${appId}`}
      onClick={() => activateApp(props, appId)}
    ><AppIcon name={app.icon} /></button>;
  };

  return <>
    <footer className="cde-panel">
      <div className="cde-tile" title={now.toLocaleTimeString()}><AnalogClock now={now} /></div>
      <div className="cde-tile cde-calendar" title={now.toLocaleDateString()}>
        <small>{now.toLocaleDateString([], { month: 'short' }).toUpperCase()}</small>
        <strong>{now.getDate()}</strong>
      </div>
      {LEFT.map(launcher)}
      <div className="cde-switch">
        <button className="cde-control" title="Lock screen" aria-label="Lock screen" onClick={() => power('lock')}>
          <Icon name="lock" />
        </button>
        <div className="cde-workspaces" role="group" aria-label="Workspaces">
          {WORKSPACES.map((name, index) => <button
            key={name}
            className={`cde-workspace ${workspace === index + 1 ? 'selected' : ''}`}
            aria-pressed={workspace === index + 1}
            onClick={() => switchWorkspace(index + 1)}
          >{name}</button>)}
        </div>
        <button className="cde-control cde-exit" title="Log out" onClick={() => power('logout')}>EXIT</button>
      </div>
      {RIGHT.map(launcher)}
    </footer>
    {menu && <PopupMenu
      x={globalThis.innerWidth / 2 - 90}
      y={globalThis.innerHeight - 380}
      onClose={() => setMenu(false)}
      items={[
        { heading: 'Workspace Menu' },
        ...apps.map((app) => ({ label: app.title, run: () => open(app.id) })),
        'separator',
        { label: 'Log out…', run: () => power('logout') },
      ]}
    />}
  </>;
}

/** The Front Panel's analog clock. */
function AnalogClock({ now }: { now: Date }) {
  const hour = (now.getHours() % 12) * 30 + now.getMinutes() / 2;
  const minute = now.getMinutes() * 6;
  return <svg className="cde-analog" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="17" />
    {Array.from({ length: 12 }, (_, index) =>
      <path key={index} d="M20 4.5v3" transform={`rotate(${index * 30} 20 20)`} />)}
    <path className="hand-hour" d="M20 20V11" transform={`rotate(${hour} 20 20)`} />
    <path className="hand-minute" d="M20 20V7" transform={`rotate(${minute} 20 20)`} />
  </svg>;
}
