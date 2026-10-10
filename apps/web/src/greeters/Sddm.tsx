import { DESKTOPS, desktopById } from '@tuxos/appearance';
import { useState } from 'react';
import { Tux } from '../desktop/Tux';
import { timeText, useNow } from '../desktops/shared/Clock';
import { Icon } from '../desktops/shared/Icons';
import { PopupMenu } from '../desktops/shared/Menu';
import type { GreeterProps } from './types';
import { cleanUsername, useLogin } from './useLogin';

/** KDE Plasma's login screen (SDDM with the Breeze theme): big clock, one user, actions along the bottom. */
export function Sddm({ savedUser, desktop, onDesktop, login, onPower }: GreeterProps) {
  const now = useNow();
  const [other, setOther] = useState(!savedUser);
  const [name, setName] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { busy, error, submit } = useLogin(login);

  return <main className="greeter sddm">
    <div className="sddm-clock">
      <div className="sddm-time">{timeText(now)}</div>
      <div className="sddm-date">
        {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
    <form
      className="sddm-form"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(other ? name.trim() : savedUser!);
      }}
    >
      <div className="sddm-avatar"><Tux /></div>
      <div className="sddm-name">{other ? (savedUser ? 'Other user' : 'Welcome to TuxOS') : savedUser}</div>
      <div className="sddm-row">
        {other
          ? <input
            aria-label="Username"
            placeholder={savedUser ? 'Username' : 'Choose a username'}
            spellCheck={false}
            autoFocus
            disabled={busy}
            value={name}
            onChange={(event) => setName(cleanUsername(event.target.value))}
          />
          : <span className="sddm-field">No password needed</span>}
        <button className={`sddm-go ${busy ? 'busy' : ''}`} type="submit" aria-label="Log in" autoFocus={!other}>
          <Icon name="arrow" />
        </button>
      </div>
      <p className={`sddm-msg ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
        {error || (other && !savedUser ? 'New here? Pick any lowercase name.' : '')}
      </p>
      {savedUser && <div className="sddm-links">
        <button type="button" onClick={() => setOther(!other)}>{other ? `‹ Back to ${savedUser}` : 'Other user…'}</button>
      </div>}
    </form>
    <div className="sddm-actions">
      <button type="button" onClick={() => onPower('restart')}>
        <span className="sddm-action-icon"><Icon name="restart" /></span><span>Restart</span>
      </button>
      <button type="button" onClick={() => onPower('shutdown')}>
        <span className="sddm-action-icon"><Icon name="power" /></span><span>Shut Down</span>
      </button>
    </div>
    <div className="sddm-bottom">
      <button
        type="button"
        className="sddm-session"
        aria-label={`Desktop Session: ${desktopById(desktop).name}`}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({ x: box.left, y: box.top - 40 - DESKTOPS.length * 34 });
        }}
      >Desktop Session: {desktopById(desktop).name} ▾</button>
      <span className="sddm-kbd">Keyboard Layout: US</span>
    </div>
    {menu && <PopupMenu
      className="greeter-menu menu-sddm"
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      items={DESKTOPS.map((each) => ({ label: `${each.id === desktop ? '● ' : '○ '}${each.name}`, run: () => onDesktop(each.id) }))}
    />}
  </main>;
}
