import { useEffect, useState } from 'react';
import { gnomeClockText, useNow } from '../shared/Clock';
import { Icon } from '../shared/Icons';
import { PopupMenu } from '../shared/Menu';
import type { ShellProps } from '../types';
import { Overview } from './Overview';
import './gnome.css';

/** GNOME's top bar: Activities on the left, the clock in the middle, the system menu on the right. */
export function GnomeShell(props: ShellProps) {
  const { power, launcherRequest, open } = props;
  const [overview, setOverview] = useState<'windows' | 'apps' | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const now = useNow();

  useEffect(() => {
    if (launcherRequest) setOverview((value) => (value ? null : 'windows'));
  }, [launcherRequest]);

  return <>
    {/* The hot corner: pushing the pointer into the top-left corner opens the overview. */}
    <div
      className="gnome-hot-corner"
      aria-hidden="true"
      onPointerEnter={() => setOverview((value) => (value ? value : 'windows'))}
    />
    <header className="gnome-bar">
      <button
        className={`gnome-chip gnome-activities ${overview ? 'active' : ''}`}
        onClick={() => setOverview(overview ? null : 'windows')}
      >Activities</button>
      <span className="gnome-clock" title={now.toLocaleString()}>{gnomeClockText(now)}</span>
      <button
        className="gnome-chip gnome-status"
        aria-label="System menu"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({ x: box.right - 230, y: box.bottom + 6 });
        }}
      ><Icon name="wifi" /><Icon name="volume" /><Icon name="power" /></button>
    </header>
    {overview && <Overview
      {...props}
      mode={overview}
      setMode={setOverview}
      onClose={() => setOverview(null)}
    />}
    {menu && <PopupMenu
      className="gnome-menu"
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      items={[
        { label: 'Settings', run: () => open('settings') },
        { label: 'Lock', run: () => power('lock') },
        'separator',
        { label: 'Log Out…', run: () => power('logout') },
        { label: 'Restart…', run: () => power('restart') },
        { label: 'Power Off…', run: () => power('shutdown') },
      ]}
    />}
  </>;
}
