import { DESKTOPS } from '@tuxos/appearance';
import { useState } from 'react';
import { Tux } from '../desktop/Tux';
import { gnomeClockText, useNow } from '../desktops/shared/Clock';
import { Icon } from '../desktops/shared/Icons';
import { PopupMenu } from '../desktops/shared/Menu';
import type { GreeterProps } from './types';
import { useLoginForm } from './useLogin';

/** GNOME's login screen (GDM): the user's name or the fields to sign in, with the session gear in the corner. */
export function Gdm(props: GreeterProps) {
  const { desktop, onDesktop, onPower } = props;
  const now = useNow();
  const form = useLoginForm(props);
  const [menu, setMenu] = useState<{ kind: 'power' | 'session'; x: number; y: number } | null>(null);

  const openMenu = (kind: 'power' | 'session') => (event: React.MouseEvent) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (kind === 'power') setMenu({ kind, x: box.right - 200, y: box.bottom + 6 });
    else setMenu({ kind, x: box.right - 220, y: box.top - 30 - DESKTOPS.length * 34 });
  };
  const go = <button
    className={`gdm-go ${form.busy ? 'busy' : ''}`}
    type="submit"
    aria-label="Log in"
    disabled={form.busy}
  ><Icon name="arrow" /></button>;

  return <main className="greeter gdm">
    <header className="gdm-bar">
      <span className="gdm-clock">{gnomeClockText(now)}</span>
      <button className="gdm-icons" aria-label="System menu" onClick={openMenu('power')}>
        <Icon name="a11y" /><Icon name="wifi" /><Icon name="volume" /><Icon name="power" />
      </button>
    </header>
    <form className="gdm-main" autoComplete="off" onSubmit={(event) => { event.preventDefault(); void form.submit(); }}>
      {form.mode === 'account' && <span className="gdm-avatar big"><Tux /></span>}
      <h1 className={form.mode === 'account' ? 'gdm-name' : 'gdm-title'}>{form.title}</h1>
      {form.needsUsername && <div className="gdm-row">
        <div className="gdm-entry">
          <input
            aria-label="Username"
            placeholder="Username"
            spellCheck={false}
            autoFocus
            disabled={form.busy}
            value={form.username}
            onChange={(event) => form.setUsername(event.target.value)}
          />
          {!form.needsPassword && go}
        </div>
      </div>}
      {form.needsPassword && <div className="gdm-row">
        <div className="gdm-entry">
          <input
            type="password"
            aria-label="Password"
            placeholder="Password"
            autoFocus={form.mode === 'account'}
            disabled={form.busy}
            value={form.password}
            onChange={(event) => form.setPassword(event.target.value)}
          />
          {go}
        </div>
      </div>}
      <p className={`gdm-msg ${form.error ? 'error' : ''}`} role={form.error ? 'alert' : 'status'}>
        {form.error || form.hint}
      </p>
      {form.others.length > 0 && <div className="gdm-links">
        {form.others.map((other) => <button key={other.mode} type="button" className="gdm-link" onClick={() => form.setMode(other.mode)}>
          {other.label}
        </button>)}
      </div>}
    </form>
    <button
      className="gdm-session"
      aria-label="Choose a desktop environment"
      title="Choose a desktop environment"
      onClick={openMenu('session')}
    ><Icon name="gear" /></button>
    {menu && <PopupMenu
      className="greeter-menu"
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      items={menu.kind === 'power'
        ? [{ label: 'Restart…', run: () => onPower('restart') }, { label: 'Power Off…', run: () => onPower('shutdown') }]
        : DESKTOPS.map((each) => ({ label: `${each.id === desktop ? '● ' : '○ '}${each.name}`, run: () => onDesktop(each.id) }))}
    />}
  </main>;
}
