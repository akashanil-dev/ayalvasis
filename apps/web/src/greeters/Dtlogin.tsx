import { DESKTOPS } from '@tuxos/appearance';
import { useRef, useState } from 'react';
import { Tux } from '../desktop/Tux';
import { PopupMenu } from '../desktops/shared/Menu';
import type { GreeterProps } from './types';
import { cleanUsername, useLogin } from './useLogin';

/** CDE's login box (dtlogin), as on Solaris and HP-UX: one prompt, then OK, Start Over, Options and Help. */
export function Dtlogin({ savedUser, desktop, onDesktop, login, onPower }: GreeterProps) {
  const [name, setName] = useState(savedUser ?? '');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [help, setHelp] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const { busy, error, submit } = useLogin(login);
  const hint = savedUser
    ? `Your account ${savedUser} is saved in this browser. Press OK to log in; no password is needed.`
    : 'New here? Type any lowercase name to create your account.';

  return <main className={`greeter dtlogin ${busy ? 'busy' : ''}`}>
    <form
      className="dt-form"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(name.trim());
      }}
    >
      <div className="dt-body">
        <div className="dt-logo">
          <span className="dt-tux"><Tux /></span>
          <strong>TuxOS</strong>
          <small>Common Desktop Environment</small>
        </div>
        <div className="dt-main">
          <h1>{savedUser ? `Welcome ${savedUser}` : 'Welcome to tuxos'}</h1>
          <label className="dt-label" htmlFor="dt-username">Please enter your user name</label>
          <input
            id="dt-username"
            ref={field}
            aria-label="Username"
            spellCheck={false}
            autoFocus
            disabled={busy}
            value={name}
            onChange={(event) => setName(cleanUsername(event.target.value))}
          />
          <p className={`dt-msg ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error || hint}</p>
        </div>
      </div>
      <div className="dt-buttons">
        <button type="submit" disabled={busy} aria-label="Log in">OK</button>
        <button type="button" onClick={() => { setName(''); field.current?.focus(); }}>Start Over</button>
        <button
          type="button"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenu({ x: box.left, y: box.bottom + 2 });
          }}
        >Options</button>
        <button type="button" onClick={() => setHelp(true)}>Help</button>
      </div>
    </form>
    {help && <div className="dt-help" role="dialog" aria-label="Help">
      <p>{hint}</p>
      <p>Use Options to pick a different desktop session, restart or shut down.</p>
      <button type="button" autoFocus onClick={() => setHelp(false)}>OK</button>
    </div>}
    {menu && <PopupMenu
      className="greeter-menu menu-dtlogin"
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      items={[
        ...DESKTOPS.map((each) => ({
          label: `Session: ${each.name}${each.id === desktop ? '  ✓' : ''}`,
          run: () => onDesktop(each.id),
        })),
        'separator',
        { label: 'Restart', run: () => onPower('restart') },
        { label: 'Shut Down', run: () => onPower('shutdown') },
      ]}
    />}
  </main>;
}
