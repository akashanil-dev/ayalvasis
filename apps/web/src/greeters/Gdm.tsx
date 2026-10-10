import { DESKTOPS } from '@tuxos/appearance';
import { useState } from 'react';
import { Tux } from '../desktop/Tux';
import { gnomeClockText, useNow } from '../desktops/shared/Clock';
import { Icon } from '../desktops/shared/Icons';
import { PopupMenu } from '../desktops/shared/Menu';
import type { GreeterProps } from './types';
import { cleanUsername, useLogin } from './useLogin';

type Step = 'users' | 'confirm' | 'username';

/** GNOME's login screen (GDM): a user list, then that user's sign-in, with the session gear in the corner. */
export function Gdm({ savedUser, desktop, onDesktop, login, onPower }: GreeterProps) {
  const now = useNow();
  const [step, setStep] = useState<Step>(savedUser ? 'users' : 'username');
  const [name, setName] = useState('');
  const [menu, setMenu] = useState<{ kind: 'power' | 'session'; x: number; y: number } | null>(null);
  const { busy, error, submit } = useLogin(login);

  const openMenu = (kind: 'power' | 'session') => (event: React.MouseEvent) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (kind === 'power') setMenu({ kind, x: box.right - 200, y: box.bottom + 6 });
    else setMenu({ kind, x: box.right - 220, y: box.top - 30 - DESKTOPS.length * 34 });
  };

  return <main className="greeter gdm">
    <header className="gdm-bar">
      <span className="gdm-clock">{gnomeClockText(now)}</span>
      <button className="gdm-icons" aria-label="System menu" onClick={openMenu('power')}>
        <Icon name="a11y" /><Icon name="wifi" /><Icon name="volume" /><Icon name="power" />
      </button>
    </header>
    {step === 'users' && <div className="gdm-main">
      <button className="gdm-user" onClick={() => setStep('confirm')} autoFocus>
        <span className="gdm-avatar small"><Tux /></span>
        <span><strong>{savedUser}</strong><small>Saved in this browser</small></span>
      </button>
      <div className="gdm-links">
        <button className="gdm-link" onClick={() => setStep('username')}>Not listed?</button>
      </div>
    </div>}
    {step !== 'users' && <form
      className="gdm-main"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(step === 'username' ? name.trim() : savedUser!);
      }}
    >
      {step === 'confirm' && <span className="gdm-avatar big"><Tux /></span>}
      <h1 className={step === 'confirm' ? 'gdm-name' : 'gdm-title'}>
        {step === 'confirm' ? savedUser : savedUser ? 'Username' : 'Welcome! Choose a username'}
      </h1>
      <div className="gdm-row">
        {savedUser && <button type="button" className="gdm-back" aria-label="Back" onClick={() => setStep('users')}>
          <Icon name="back" />
        </button>}
        <div className="gdm-entry">
          {step === 'username'
            ? <input
              aria-label="Username"
              placeholder="Username"
              spellCheck={false}
              autoFocus
              disabled={busy}
              value={name}
              onChange={(event) => setName(cleanUsername(event.target.value))}
            />
            : <span className="gdm-nopass">No password needed</span>}
          <button
            className={`gdm-go ${busy ? 'busy' : ''}`}
            type="submit"
            aria-label={step === 'username' ? 'Next' : 'Sign In'}
            autoFocus={step === 'confirm'}
          >
            <Icon name="arrow" />
          </button>
        </div>
      </div>
      <p className={`gdm-msg ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
        {error || (step === 'username' && !savedUser ? 'Pick any lowercase name to create your account.' : '')}
      </p>
    </form>}
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
