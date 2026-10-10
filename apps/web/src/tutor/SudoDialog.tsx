import type { SystemClient } from '@tuxos/system';
import { useEffect, useState } from 'react';
import { Puppet } from './Puppet';
import type { SudoRequest } from './useTutor';

/**
 * Vasi asking for root, like the authentication dialog a Linux desktop shows when a program needs admin
 * rights: first the reason with Allow or Deny, then the learner's password.
 */
export function SudoDialog({ system, request }: { system: SystemClient; request: SudoRequest }) {
  const [step, setStep] = useState<'ask' | 'password'>('ask');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { void system.user().then(setUser).catch(() => setUser('')); }, [system]);

  return <div className="sudo-backdrop">
    <form
      className="sudo-dialog"
      role="dialog"
      aria-label="Authentication required"
      onKeyDown={(event) => { if (event.key === 'Escape') request.answer(false); }}
      onSubmit={(event) => {
        event.preventDefault();
        if (step === 'ask') return setStep('password');
        if (!password) return setError('Type your password to allow this.');
        request.answer(true);
      }}
    >
      <div className="sudo-head">
        <span className="sudo-avatar"><Puppet /></span>
        <div>
          <h2>Authentication required</h2>
          <p>Vasi wants to run commands as the administrator (root) with <code>sudo</code>.</p>
        </div>
      </div>
      <blockquote className="sudo-reason">{request.reason}</blockquote>
      {step === 'ask'
        ? <p className="sudo-note">With sudo, Vasi can change anything on this system until you log out or revoke it.</p>
        : <>
          <label className="sudo-field">
            Password for {user || 'your account'}
            <input
              type="password"
              aria-label="Password"
              autoFocus
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(''); }}
            />
          </label>
          <p className={`sudo-note ${error ? 'error' : ''}`} role={error ? 'alert' : undefined}>
            {error || 'On a real Linux system this is your login password. TuxOS accounts have none, so any password works here.'}
          </p>
        </>}
      <div className="sudo-buttons">
        <button type="button" onClick={() => request.answer(false)}>{step === 'ask' ? 'Deny' : 'Cancel'}</button>
        <button type="submit" className="sudo-primary" autoFocus={step === 'ask'}>
          {step === 'ask' ? 'Allow' : 'Authenticate'}
        </button>
      </div>
    </form>
  </div>;
}
