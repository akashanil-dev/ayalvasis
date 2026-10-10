import type { SystemClient } from '@ayalvasis/system';
import { useEffect, useState } from 'react';

export interface AppViewProps {
  system: SystemClient;
  windowId: string;
}

export default function AboutView({ system }: AppViewProps) {
  const [details, setDetails] = useState({ hostname: '...', user: '...', kernel: '6.6.0-ayalvasis' });

  useEffect(() => {
    let alive = true;
    Promise.all([
      system.dispatch<string>('fs.read', { path: '/etc/hostname' }),
      system.dispatch<string>('fs.read', { path: '/etc/passwd' }),
    ]).then(([hostname, passwd]) => {
      if (!alive || !hostname.ok || !passwd.ok) return;
      const user = passwd.value.split('\n').find((line) => line.includes(':1000:'))?.split(':')[0] ?? 'unknown';
      setDetails({ hostname: hostname.value.trim(), user, kernel: '6.6.0-ayalvasis' });
    });
    return () => { alive = false; };
  }, [system]);

  return <div className="about-view">
    <div className="about-mark">ⓘ</div>
    <h2>About this system</h2>
    <p>A small Linux desktop for learning by doing.</p>
    <dl>
      <dt>Hostname</dt><dd>{details.hostname}</dd>
      <dt>User</dt><dd>{details.user}</dd>
      <dt>Kernel</dt><dd>{details.kernel}</dd>
    </dl>
  </div>;
}
