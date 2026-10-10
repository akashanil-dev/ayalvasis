import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useEffect, useState } from 'react';
import { Boot } from './screens/Boot';
import { Desktop } from './screens/Desktop';
import { Login } from './screens/Login';

export { Desktop } from './screens/Desktop';

export function App({ system, tutor }: { system: SystemClient; tutor?: Transport }) {
  const [screen, setScreen] = useState<'boot' | 'login' | 'desktop'>('boot');
  const [savedUser, setSavedUser] = useState<string | null>(null);

  useEffect(() => {
    // Only leave the boot screen: if the learner already skipped it and logged in, stay where they are.
    const timer = setTimeout(() => setScreen((current) => (current === 'boot' ? 'login' : current)), 1500);
    void system.hasSave().then(setSavedUser).catch(() => setSavedUser(null));
    return () => clearTimeout(timer);
  }, [system]);

  if (screen === 'boot') return <Boot onSkip={() => setScreen('login')} />;
  if (screen === 'login') {
    return <Login system={system} savedUser={savedUser} onBoot={() => setScreen('desktop')} />;
  }
  return <Desktop system={system} tutor={tutor} />;
}
