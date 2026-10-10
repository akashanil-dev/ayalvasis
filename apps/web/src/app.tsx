import type { SystemClient } from '@ayalvasis/system';
import { useEffect, useState } from 'react';
import { Boot } from './screens/Boot';
import { Desktop } from './screens/Desktop';
import { Login } from './screens/Login';

export { Desktop } from './screens/Desktop';

export function App({ system }: { system: SystemClient }) {
  const [screen, setScreen] = useState<'boot' | 'login' | 'desktop'>('boot');
  const [savedUser, setSavedUser] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setScreen('login'), 1500);
    void system.hasSave().then(setSavedUser).catch(() => setSavedUser(null));
    return () => clearTimeout(timer);
  }, [system]);

  if (screen === 'boot') return <Boot onSkip={() => setScreen('login')} />;
  if (screen === 'login') {
    return <Login system={system} savedUser={savedUser} onBoot={() => setScreen('desktop')} />;
  }
  return <Desktop system={system} />;
}
