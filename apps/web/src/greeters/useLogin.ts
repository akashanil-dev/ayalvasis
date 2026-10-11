import { useState } from 'react';
import type { GreeterProps, LoginMode } from './types';

const LABELS: Record<LoginMode, string> = {
  account: 'Continue',
  signin: 'Sign in',
  register: 'Create account',
  guest: 'Try without an account',
};

/**
 * The login steps every greeter shares: which mode it is in, the fields that mode needs, a hint, the other
 * modes to switch to, and submitting. Each greeter only decides how it looks.
 */
export function useLoginForm({ account, savedUser, accountsEnabled, login }: GreeterProps) {
  const initial: LoginMode = account ? 'account' : !accountsEnabled || savedUser ? 'guest' : 'register';
  const [mode, setModeState] = useState<LoginMode>(initial);
  const [username, setUsername] = useState(initial === 'guest' ? savedUser ?? '' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setMode = (next: LoginMode) => {
    setModeState(next);
    setError('');
    setPassword('');
    // A guest signing up keeps their name, so their saved progress moves into the new account.
    setUsername(next === 'guest' || next === 'register' ? savedUser ?? '' : '');
  };

  const needsUsername = mode !== 'account';
  const needsPassword = mode === 'signin' || mode === 'register';
  const shownName = mode === 'account' ? account! : username;

  async function submit() {
    setError('');
    const name = mode === 'account' ? account! : username.trim();
    if (!name) return setError('Please enter a user name.');
    if (needsPassword && !password) return setError(mode === 'register' ? 'Choose a password.' : 'Please enter your password.');
    setBusy(true);
    try {
      await login({ mode, username: name, password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  const others: { mode: LoginMode; label: string }[] = (!accountsEnabled ? [] : [
    ...(account && mode !== 'account' ? [{ mode: 'account' as const, label: `Continue as ${account}` }] : []),
    ...(mode !== 'signin' ? [{ mode: 'signin' as const, label: mode === 'account' ? 'Use another account' : 'Sign in' }] : []),
    ...(mode !== 'register' ? [{ mode: 'register' as const, label: 'Create account' }] : []),
    ...(mode !== 'guest' ? [{ mode: 'guest' as const, label: LABELS.guest }] : []),
  ]);

  const hint = error ? '' : {
    account: `Signed in as ${account}. Your progress is saved to your account.`,
    signin: 'Sign in to continue where you left off, on any device.',
    register: savedUser && username === savedUser
      ? `Your progress in this browser moves into the new account.`
      : 'Pick a lowercase username and any password. Your progress is saved to your account.',
    guest: savedUser ? 'Your progress is saved in this browser only.' : 'Pick any lowercase name. Progress stays in this browser only.',
  }[mode];

  return {
    mode, setMode, title: mode === 'account' ? account! : LABELS[mode], submitLabel: LABELS[mode],
    username, setUsername: (value: string) => setUsername(cleanUsername(value)), shownName,
    password, setPassword, needsUsername, needsPassword, busy, error, hint, others, submit,
  };
}

/** Linux user names are lowercase with no spaces, so the field fixes them as you type. */
export const cleanUsername = (value: string) => value.toLowerCase().replace(/\s/g, '');
