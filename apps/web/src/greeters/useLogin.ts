import { useState } from 'react';

/** The login request every greeter makes: busy while the system boots, with a readable error if it fails. */
export function useLogin(login: (username: string) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(username: string) {
    setError('');
    if (!username) {
      setError('Please enter a user name.');
      return;
    }
    setBusy(true);
    try {
      await login(username);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return { busy, error, submit };
}

/** Linux user names are lowercase with no spaces, so the field fixes them as you type. */
export const cleanUsername = (value: string) => value.toLowerCase().replace(/\s/g, '');
