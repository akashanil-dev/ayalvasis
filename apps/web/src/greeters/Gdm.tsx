import { DESKTOPS } from '@tuxos/appearance';
import { useState } from 'react';
import { gnomeClockText, useNow } from '../desktops/shared/Clock';
import { Icon } from '../desktops/shared/Icons';
import { PopupMenu } from '../desktops/shared/Menu';
import { Puppet } from '../tutor/Puppet';
import type { GreeterProps } from './types';

type Step = 'users' | 'confirm' | 'username';

/** GNOME's login screen (GDM): a user list, then that user's sign-in, with the session gear beside it. */
export function Gdm({ savedUser, desktop, onDesktop, login, onPower }: GreeterProps) {
  const now = useNow();
  const [step, setStep] = useState<Step>(savedUser ? 'users' : 'username');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<{ kind: 'power' | 'session'; x: number; y: number } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await login(step === 'username' ? name.trim() : savedUser!);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const openMenu = (kind: 'power' | 'session') => (event: React.MouseEvent) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ kind, x: kind === 'power' ? box.right - 220 : box.left, y: box.bottom + 6 });
  };

  return <main className="greeter gdm">
    <header className="gdm-bar">
      <span />
      <span className="gdm-clock">{gnomeClockText(now)}</span>
      <button className="gdm-system" aria-label="System menu" onClick={openMenu('power')}>
        <Icon name="a11y" /><Icon name="wifi" /><Icon name="volume" /><Icon name="power" />
      </button>
    </header>
    <section className="gdm-center">
      {step === 'users' && <>
        <button className="gdm-user" onClick={() => setStep('confirm')} autoFocus>
          <span className="gdm-avatar"><Puppet /></span>
          <span>{savedUser}</span>
        </button>
        <button className="gdm-link" onClick={() => setStep('username')}>Not listed?</button>
      </>}
      {step !== 'users' && <form className="gdm-form" onSubmit={submit}>
        {step === 'confirm'
          ? <>
            <span className="gdm-avatar big"><Puppet /></span>
            <h1 className="gdm-name">{savedUser}</h1>
          </>
          : <h1 className="gdm-title">{savedUser ? 'Username' : 'Welcome! Choose a username'}</h1>}
        <div className="gdm-row">
          {savedUser && <button type="button" className="gdm-round" aria-label="Back" onClick={() => setStep('users')}>
            <Icon name="back" />
          </button>}
          {step === 'username'
            ? <input
              className="gdm-entry"
              aria-label="Username"
              autoFocus
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            : <button className="gdm-entry gdm-signin" type="submit" autoFocus>Sign In</button>}
          <button className="gdm-round" type="submit" aria-label="Next"><Icon name="arrow" /></button>
          <button type="button" className="gdm-round" aria-label="Choose a desktop environment" onClick={openMenu('session')}>
            <Icon name="gear" />
          </button>
        </div>
        <p className="gdm-session-name">{DESKTOPS.find((each) => each.id === desktop)?.name}</p>
        {error && <p className="greeter-error" role="alert">{error}</p>}
      </form>}
    </section>
    {menu && <PopupMenu
      className="gdm-menu"
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      items={menu.kind === 'power'
        ? [{ label: 'Restart…', run: () => onPower('restart') }, { label: 'Power Off…', run: () => onPower('shutdown') }]
        : DESKTOPS.map((each) => ({ label: `${each.id === desktop ? '● ' : '   '}${each.name}`, run: () => onDesktop(each.id) }))}
    />}
  </main>;
}
