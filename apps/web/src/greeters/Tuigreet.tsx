import { DESKTOPS, desktopById } from '@tuxos/appearance';
import { useEffect, useState } from 'react';
import { useNow } from '../desktops/shared/Clock';
import { PopupMenu, type MenuItem } from '../desktops/shared/Menu';
import type { GreeterProps } from './types';
import { cleanUsername, useLogin } from './useLogin';

/**
 * tuigreet, the text-mode greeter many Hyprland setups use: a box on a black screen, driven by the
 * keyboard. The key hints along the bottom are clickable too.
 */
export function Tuigreet({ savedUser, desktop, onDesktop, login, onPower }: GreeterProps) {
  const now = useNow(1000);
  const [name, setName] = useState(savedUser ?? '');
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const { busy, error, submit } = useLogin(login);

  const sessions = () => setMenu(DESKTOPS.map((each) => ({
    label: `${each.id === desktop ? '(*)' : '( )'} ${each.name}`,
    run: () => onDesktop(each.id),
  })));
  const power = () => setMenu([
    { label: 'Reboot', run: () => onPower('restart') },
    { label: 'Power off', run: () => onPower('shutdown') },
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F3') { event.preventDefault(); sessions(); }
      if (event.key === 'F12') { event.preventDefault(); power(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <main className="greeter tuigreet">
    <div className="tui-time">
      {now.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}{' '}
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
    <form
      className="tui-box"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(name.trim());
      }}
    >
      <span className="tui-title"> Authenticate into tuxos </span>
      <p className="tui-greet">{savedUser ? `Welcome back, ${savedUser}` : 'Welcome to TuxOS'}</p>
      <label className="tui-line">
        <span className="tui-key">Username:</span>
        <input
          aria-label="Username"
          spellCheck={false}
          autoFocus
          disabled={busy}
          value={name}
          onChange={(event) => setName(cleanUsername(event.target.value))}
        />
      </label>
      <p className={`tui-msg ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
        {busy ? 'Authenticating...' : error || 'Press Enter to log in. No password needed.'}
      </p>
      <button type="submit" className="tui-submit" aria-label="Log in" disabled={busy} />
    </form>
    <div className="tui-bar">
      <button type="button" className="tui-hint" onClick={sessions}><b>F3</b> Change session</button>
      <button type="button" className="tui-hint" onClick={power}><b>F12</b> Power</button>
      <span className="tui-session">Session: {desktopById(desktop).name}</span>
    </div>
    {menu && <PopupMenu
      className="greeter-menu menu-tui"
      x={14}
      y={globalThis.innerHeight - 60 - menu.length * 34}
      onClose={() => setMenu(null)}
      items={menu}
    />}
  </main>;
}
