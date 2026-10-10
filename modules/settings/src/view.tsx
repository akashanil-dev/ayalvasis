import { DESKTOPS, WALLPAPERS } from '@tuxos/appearance';
import type { AppViewProps } from '@tuxos/system';
import { useEffect, useState } from 'react';
import './settings.css';

type Page = 'desktop' | 'wallpaper' | 'about';

const PAGES: { id: Page; label: string }[] = [
  { id: 'desktop', label: 'Desktop Environment' },
  { id: 'wallpaper', label: 'Wallpaper' },
  { id: 'about', label: 'About' },
];

export default function SettingsView({ system }: AppViewProps) {
  const [page, setPage] = useState<Page>('desktop');
  const [current, setCurrent] = useState({ desktop: '', wallpaper: '' });
  const [about, setAbout] = useState({ user: '', hostname: '' });

  useEffect(() => {
    const load = () => void system.session().then(({ desktop, wallpaper }) => setCurrent({ desktop, wallpaper }));
    load();
    void Promise.all([system.user(), system.hostname()]).then(([user, hostname]) => setAbout({ user, hostname }));
    return system.onChange((event) => { if (event.action.type.startsWith('session.set')) load(); });
  }, [system]);

  return <div className="settings-view">
    <nav className="settings-nav" aria-label="Settings pages">
      {PAGES.map((each) => <button
        key={each.id}
        className={each.id === page ? 'selected' : ''}
        aria-current={each.id === page ? 'page' : undefined}
        onClick={() => setPage(each.id)}
      >{each.label}</button>)}
    </nav>
    <section className="settings-page">
      {page === 'desktop' && <>
        <h1>Desktop Environment</h1>
        <p className="settings-intro">
          On Linux the desktop itself is a program you can swap. Each one arranges windows, panels and menus its own
          way, while your files and apps stay the same.
        </p>
        <div className="settings-cards">
          {DESKTOPS.map((desktop) => <article
            key={desktop.id}
            className={`settings-card ${desktop.id === current.desktop ? 'current' : ''}`}
          >
            <div className={`settings-preview preview-${desktop.id}`} aria-hidden="true"><i /><b /></div>
            <h2>{desktop.name}</h2>
            <p>{desktop.summary}</p>
            <p className="settings-used">Used by: {desktop.usedBy}</p>
            {desktop.id === current.desktop
              ? <span className="settings-badge">In use</span>
              : <button onClick={() => void system.dispatch('session.setDesktop', { desktop: desktop.id })}>
                Switch to {desktop.name}
              </button>}
          </article>)}
        </div>
      </>}
      {page === 'wallpaper' && <>
        <h1>Wallpaper</h1>
        <div className="settings-wallpapers" role="radiogroup" aria-label="Wallpaper">
          {WALLPAPERS.map((wallpaper) => <button
            key={wallpaper.id}
            role="radio"
            aria-checked={wallpaper.id === current.wallpaper}
            className="settings-wallpaper"
            onClick={() => void system.dispatch('session.setWallpaper', { wallpaper: wallpaper.id })}
          >
            <span style={{ background: wallpaper.background }} />
            {wallpaper.name}
          </button>)}
        </div>
      </>}
      {page === 'about' && <>
        <h1>About This System</h1>
        <dl className="settings-about">
          <dt>Operating system</dt><dd>TuxOS 1.0</dd>
          <dt>Kernel</dt><dd>Linux 6.10.0-tuxos</dd>
          <dt>Desktop</dt><dd>{DESKTOPS.find((each) => each.id === current.desktop)?.name}</dd>
          <dt>Hostname</dt><dd>{about.hostname}</dd>
          <dt>User</dt><dd>{about.user}</dd>
        </dl>
        <p className="settings-intro">TuxOS runs entirely in your browser. Nothing on your real computer is changed.</p>
      </>}
    </section>
  </div>;
}
