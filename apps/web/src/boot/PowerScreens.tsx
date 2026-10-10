import { useEffect, useState } from 'react';
import { Puppet } from '../tutor/Puppet';

const STOPPING = [
  'Stopping session-2.scope - Session 2 of User…',
  'Stopped display-manager.service - Display Manager.',
  'Stopped docker.service - Docker Application Container Engine.',
  'Stopped NetworkManager.service - Network Manager.',
  'Unmounted tmp.mount - Temporary Directory /tmp.',
  'Reached target shutdown.target - System Shutdown.',
  'Reached target final.target - Late Shutdown Services.',
];

/** systemd stopping everything, then a dark screen: click or press a key to turn the computer back on. */
export function PowerOff({ onPowerOn }: { onPowerOn(): void }) {
  const [shown, setShown] = useState(0);
  const off = shown > STOPPING.length;

  useEffect(() => {
    if (off) return;
    const timer = setTimeout(() => setShown(shown + 1), 160);
    return () => clearTimeout(timer);
  }, [shown, off]);

  useEffect(() => {
    if (!off) return;
    window.addEventListener('keydown', onPowerOn);
    return () => window.removeEventListener('keydown', onPowerOn);
  }, [off, onPowerOn]);

  if (off) {
    return <main className="power-off" onClick={onPowerOn}>
      <button className="power-button" onClick={onPowerOn} aria-label="Turn TuxOS on">⏻</button>
      <p>TuxOS is off. Press the power button (or any key) to start it again.</p>
    </main>;
  }
  return <main className="bootlog">
    {STOPPING.slice(0, shown).map((line) => <div key={line}>
      <span className="bootlog-bracket">[</span><span className="bootlog-ok">  OK  </span>
      <span className="bootlog-bracket">] </span>{line}
    </div>)}
  </main>;
}

/** What shows while a desktop session starts: Plasma's logo and progress bar, or GNOME's quiet fade. */
export function SessionSplash({ desktop, onDone }: { desktop: string; onDone(): void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, desktop === 'plasma' ? 1400 : 600);
    return () => clearTimeout(timer);
  }, [desktop, onDone]);

  if (desktop !== 'plasma') return <main className="splash splash-gnome" />;
  return <main className="splash splash-plasma" role="status" aria-label="Starting KDE Plasma">
    <span className="splash-logo"><Puppet /></span>
    <span className="splash-name">TuxOS · Plasma</span>
    <span className="splash-progress"><i /></span>
  </main>;
}
