import { useEffect, useState } from 'react';

type Line = { kind: 'kernel' | 'ok' | 'plain'; text: string };

/** What a Linux boot prints: the kernel's own messages, then systemd starting each service. */
export function bootLines(recovery: boolean): Line[] {
  const kernel = [
    'Linux version 6.10.0-tuxos (builder@tuxos) (gcc 14.2.0, GNU ld 2.43) #1 SMP PREEMPT_DYNAMIC',
    `Command line: BOOT_IMAGE=/boot/vmlinuz-6.10.0-tuxos root=/dev/sda2 ro ${recovery ? 'single' : 'quiet splash'}`,
    'BIOS-provided physical RAM map: usable 4096 MiB',
    'smpboot: Allowing 4 CPUs, 0 hotplug CPUs',
    'Memory: 3981244K/4194304K available',
    'ACPI: Core revision 20240322',
    'PCI: Using configuration type 1 for base access',
    'NET: Registered PF_INET protocol family',
    'EXT4-fs (sda2): mounted filesystem with ordered data mode',
    'Run /sbin/init as init process',
  ].map((text, index) => ({ kind: 'kernel' as const, text: `[${(index * 0.31).toFixed(6).padStart(12)}] ${text}` }));
  const services = [
    'Started systemd-journald.service - Journal Service.',
    'Mounted tmp.mount - Temporary Directory /tmp.',
    'Started systemd-udevd.service - Rule-based Manager for Device Events and Files.',
    'Reached target local-fs.target - Local File Systems.',
    'Started NetworkManager.service - Network Manager.',
    'Reached target network.target - Network.',
    'Started cron.service - Regular background program processing daemon.',
    'Started docker.service - Docker Application Container Engine.',
    recovery ? 'Reached target rescue.target - Rescue Mode.' : 'Started display-manager.service - Display Manager.',
  ].map((text) => ({ kind: 'ok' as const, text }));
  return [...kernel, { kind: 'plain', text: '' }, { kind: 'plain', text: 'Welcome to TuxOS 1.0!' },
    { kind: 'plain', text: '' }, ...services];
}

/** Prints the boot log line by line. Any key or click skips to the end. */
export function BootLog({ recovery, onDone }: { recovery: boolean; onDone(): void }) {
  const lines = bootLines(recovery);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= lines.length) {
      const timer = setTimeout(onDone, 350);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setShown(shown + 1), shown < 10 ? 45 : 90);
    return () => clearTimeout(timer);
  }, [shown, lines.length, onDone]);

  useEffect(() => {
    const skip = () => setShown(lines.length);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [lines.length]);

  return <main className="bootlog" onPointerDown={() => setShown(lines.length)} aria-live="polite">
    {lines.slice(0, shown).map((line, index) => <div key={index}>
      {line.kind === 'ok' ? <><span className="bootlog-bracket">[</span><span className="bootlog-ok">  OK  </span>
        <span className="bootlog-bracket">] </span>{line.text}</> : line.text || ' '}
    </div>)}
  </main>;
}
