import { DESKTOPS } from '@tuxos/appearance';
import { useState } from 'react';
import { dateText, timeText, useNow } from '../desktops/shared/Clock';
import { Icon } from '../desktops/shared/Icons';
import { Puppet } from '../tutor/Puppet';
import type { GreeterProps } from './types';

/** KDE Plasma's login screen (SDDM with the Breeze look): big clock, one user, actions along the bottom. */
export function Sddm({ savedUser, desktop, onDesktop, login, onPower }: GreeterProps) {
  const now = useNow();
  const [other, setOther] = useState(!savedUser);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(other ? name.trim() : savedUser!);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return <main className="greeter sddm">
    <div className="sddm-clock">
      <span className="sddm-time">{timeText(now)}</span>
      <span className="sddm-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    </div>
    <form className="sddm-login" onSubmit={submit}>
      <span className="sddm-avatar"><Puppet /></span>
      {other
        ? <input
          className="sddm-field"
          aria-label="Username"
          placeholder={savedUser ? 'Username' : 'Choose a username'}
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        : <span className="sddm-user">{savedUser}</span>}
      <div className="sddm-row">
        <span className="sddm-hint">{other && !savedUser ? 'New here? Pick any lowercase name.' : 'No password needed in TuxOS'}</span>
        <button className="sddm-go" type="submit" disabled={busy || (other && !name.trim())} aria-label="Log in">
          <Icon name="arrow" />
        </button>
      </div>
      {error && <p className="greeter-error" role="alert">{error}</p>}
    </form>
    <div className="sddm-actions">
      <button onClick={() => onPower('restart')}><Icon name="restart" /><span>Restart</span></button>
      <button onClick={() => onPower('shutdown')}><Icon name="power" /><span>Shut Down</span></button>
      {savedUser && <button onClick={() => setOther(!other)}>
        <Icon name="a11y" /><span>{other ? savedUser : 'Other…'}</span>
      </button>}
    </div>
    <label className="sddm-session">
      Desktop Session:
      <select value={desktop} onChange={(event) => onDesktop(event.target.value)}>
        {DESKTOPS.map((each) => <option key={each.id} value={each.id}>{each.name}</option>)}
      </select>
    </label>
    <span className="sddm-corner">{dateText(now)}</span>
  </main>;
}
