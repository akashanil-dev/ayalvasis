import type { SystemClient } from '@ayalvasis/system';
import { useState } from 'react';

interface LoginProps {
  system: SystemClient;
  savedUser: string | null;
  onBoot(): void;
}

export function Login({ system, savedUser, onBoot }: LoginProps) {
  const [username, setUsername] = useState(savedUser ?? '');
  const [error, setError] = useState('');

  const boot = async (name: string) => {
    try {
      await system.boot(name);
      onBoot();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return <main className="login-screen">
    <section className="login-card">
      <div className="login-logo">λ</div>
      <h1>Welcome to ayalvasis</h1>
      <p>Choose a Linux username to start learning.</p>
      <form onSubmit={(event) => { event.preventDefault(); void boot(username); }}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoFocus
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit">Start system</button>
      </form>
      {savedUser && <button className="saved-button" onClick={() => void boot(savedUser)}>
        Continue as {savedUser}
      </button>}
    </section>
  </main>;
}
