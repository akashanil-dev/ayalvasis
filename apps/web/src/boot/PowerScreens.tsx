import { useEffect, useState } from 'react';

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
      <p>System halted.</p>
      <button className="power-button" onClick={onPowerOn}>Press any key to power on.</button>
    </main>;
  }
  return <main className="bootlog">
    {STOPPING.slice(0, shown).map((line) => <div key={line}>
      <span className="bootlog-bracket">[</span><span className="bootlog-ok">  OK  </span>
      <span className="bootlog-bracket">] </span>{line}
    </div>)}
  </main>;
}

/** How long each desktop's splash shows before its shell appears. */
const SPLASH_MS: Record<string, number> = { plasma: 1400, gnome: 600, cde: 1300, hyprland: 1100 };

/** What shows while a desktop session starts: each desktop environment's own splash screen. */
export function SessionSplash({ desktop, onDone }: { desktop: string; onDone(): void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SPLASH_MS[desktop] ?? 600);
    return () => clearTimeout(timer);
  }, [desktop, onDone]);

  switch (desktop) {
    case 'plasma':
      return <main className="splash splash-plasma" role="status" aria-label="Starting KDE Plasma">
        <span className="plasma-logo" />
        <strong>Plasma</strong>
        <span className="splash-progress"><i /></span>
      </main>;
    case 'cde':
      return <main className="splash splash-cde" role="status">
        <p>Starting the Common Desktop Environment…</p>
      </main>;
    case 'hyprland':
      return <main className="splash splash-hyprland" role="status" aria-label="Starting Hyprland">
        <strong className="hypr-logo">Hyprland</strong>
      </main>;
    default:
      return <main className="splash splash-gnome" />;
  }
}
