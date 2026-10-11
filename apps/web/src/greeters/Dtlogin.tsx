import { DESKTOPS } from '@tuxos/appearance';
import { useState } from 'react';
import { Tux } from '../desktop/Tux';
import { PopupMenu, type MenuItem } from '../desktops/shared/Menu';
import type { GreeterProps } from './types';
import { useLoginForm } from './useLogin';

/**
 * CDE's login box (dtlogin), as on Solaris and HP-UX: one prompt at a time (user name, then password), with
 * OK, Start Over, Options and Help.
 */
export function Dtlogin(props: GreeterProps) {
  const { desktop, onDesktop, onPower } = props;
  const form = useLoginForm(props);
  const [askPassword, setAskPassword] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [help, setHelp] = useState(false);
  // An account that is still signed in only needs its password; everyone else gives the user name first.
  const onPasswordPrompt = form.needsPassword && (askPassword || form.mode === 'account');

  const startOver = () => {
    setAskPassword(false);
    form.setMode(form.mode);
  };
  const options: MenuItem[] = [
    ...form.others.map((other) => ({ label: other.label, run: () => { setAskPassword(false); form.setMode(other.mode); } })),
    ...(form.others.length ? ['separator' as const] : []),
    ...DESKTOPS.map((each) => ({ label: `Session: ${each.name}${each.id === desktop ? '  ✓' : ''}`, run: () => onDesktop(each.id) })),
    'separator',
    { label: 'Restart', run: () => onPower('restart') },
    { label: 'Shut Down', run: () => onPower('shutdown') },
  ];

  return <main className={`greeter dtlogin ${form.busy ? 'busy' : ''}`}>
    <form
      className="dt-form"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        // The user name comes first; OK then asks for the password, as dtlogin does.
        if (form.needsPassword && !onPasswordPrompt) {
          if (form.username.trim()) setAskPassword(true);
          else void form.submit();
          return;
        }
        void form.submit();
      }}
    >
      <div className="dt-body">
        <div className="dt-logo">
          <span className="dt-tux"><Tux /></span>
          <strong>TuxOS</strong>
          <small>Common Desktop Environment</small>
        </div>
        <div className="dt-main">
          <h1>{form.mode === 'account' ? `Welcome ${form.shownName}` : form.mode === 'register' ? 'Create an account' : 'Welcome to tuxos'}</h1>
          {onPasswordPrompt
            ? <label className="dt-label">Please enter your password
              <input type="password" aria-label="Password" autoFocus disabled={form.busy} value={form.password}
                onChange={(event) => form.setPassword(event.target.value)} />
            </label>
            : <label className="dt-label">Please enter your user name
              <input aria-label="Username" spellCheck={false} autoFocus disabled={form.busy} value={form.username}
                onChange={(event) => form.setUsername(event.target.value)} />
            </label>}
          <p className={`dt-msg ${form.error ? 'error' : ''}`} role={form.error ? 'alert' : 'status'}>{form.error || form.hint}</p>
        </div>
      </div>
      <div className="dt-buttons">
        <button type="submit" disabled={form.busy} aria-label={form.needsPassword && !onPasswordPrompt ? 'OK' : 'Log in'}>OK</button>
        <button type="button" onClick={startOver}>Start Over</button>
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
      <p>{form.hint}</p>
      <p>Use Options to sign in, create an account, try TuxOS without one, or pick a different desktop session.</p>
      <button type="button" autoFocus onClick={() => setHelp(false)}>OK</button>
    </div>}
    {menu && <PopupMenu className="greeter-menu menu-dtlogin" x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={options} />}
  </main>;
}
