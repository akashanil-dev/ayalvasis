import { DESKTOPS, WALLPAPERS, desktopById } from '@tuxos/appearance';
import type { AppViewProps } from '@tuxos/system';
import { useEffect, useState } from 'react';
import './settings.css';

/** Settings: pick any desktop environment or wallpaper at any time, and see what this system is. */
export default function SettingsView({ system }: AppViewProps) {
  const [current, setCurrent] = useState({ desktop: '', wallpaper: '' });
  const [about, setAbout] = useState({ user: '', hostname: '' });

  useEffect(() => {
    const load = () => void system.session().then(({ desktop, wallpaper }) => setCurrent({ desktop, wallpaper }));
    load();
    void Promise.all([system.user(), system.hostname()]).then(([user, hostname]) => setAbout({ user, hostname }));
    return system.onChange((event) => { if (event.action.type.startsWith('session.set')) load(); });
  }, [system]);

  return <div className="settings">
    <h3>Desktop environment</h3>
    <p className="settings-intro">
      On Linux the desktop itself is a program you can swap. Each one arranges windows, panels and menus its own
      way, while your files and apps stay the same. Try them all, any time.
    </p>
    <div className="theme-grid">
      {DESKTOPS.map((desktop) => {
        const inUse = desktop.id === current.desktop;
        return <button
          key={desktop.id}
          className={`theme-card ${inUse ? 'active' : ''}`}
          aria-pressed={inUse}
          aria-label={inUse ? `${desktop.name}, in use` : `Switch to ${desktop.name}`}
          onClick={() => { if (!inUse) void system.dispatch('session.setDesktop', { desktop: desktop.id }); }}
        >
          <span className={`theme-preview tp-${desktop.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>{desktop.name}</strong>
          <small>{desktop.version}{inUse ? ' · in use' : ''}</small>
          <small>{desktop.summary}</small>
          <small className="theme-used">Used by: {desktop.usedBy}</small>
        </button>;
      })}
    </div>

    <h3>Wallpaper</h3>
    <div className="wall-grid" role="radiogroup" aria-label="Wallpaper">
      {WALLPAPERS.map((wallpaper) => <button
        key={wallpaper.id}
        role="radio"
        aria-checked={wallpaper.id === current.wallpaper}
        aria-label={`Wallpaper: ${wallpaper.name}`}
        className={`wall ${wallpaper.id === current.wallpaper ? 'active' : ''}`}
        style={{ background: wallpaper.thumbnail }}
        onClick={() => void system.dispatch('session.setWallpaper', { wallpaper: wallpaper.id })}
      >{wallpaper.name}</button>)}
    </div>

    <h3>About this system</h3>
    <div className="about-system">
      <dl className="about-specs">
        <dt>Operating system</dt><dd>TuxOS 1.0</dd>
        <dt>Kernel</dt><dd>Linux 6.10.0-tuxos</dd>
        <dt>Desktop</dt><dd>{current.desktop && `${desktopById(current.desktop).name} (${desktopById(current.desktop).version})`}</dd>
        <dt>Hostname</dt><dd>{about.hostname}</dd>
        <dt>User</dt><dd>{about.user}</dd>
      </dl>
      <p className="about-blurb">TuxOS runs entirely in your browser. Nothing on your real computer is changed.</p>
    </div>
  </div>;
}
