import { DEFAULT_DESKTOP, DEFAULT_WALLPAPER, type SessionState } from '@tuxos/kernel';
import type { AppContribution } from '@tuxos/sdk';
import type { SystemClient } from '@tuxos/system';
import { useEffect, useState } from 'react';

const emptySession: SessionState = {
  windows: [], focusedId: null, nextId: 1, desktop: DEFAULT_DESKTOP, wallpaper: DEFAULT_WALLPAPER,
};

/** The running session (windows, desktop, wallpaper), the installed apps and the user, kept up to date. */
export function useSession(system: SystemClient) {
  const [apps, setApps] = useState<(AppContribution & { moduleId: string })[]>([]);
  const [session, setSession] = useState<SessionState>(emptySession);
  const [user, setUser] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    // Session reads can finish out of order; only the most recently started one may update the screen.
    let latest = 0;
    const refresh = async () => {
      const ticket = ++latest;
      const current = await system.session();
      if (active && ticket === latest) setSession(current);
    };
    void Promise.all([system.apps(), system.user(), refresh()]).then(([appList, name]) => {
      if (!active) return;
      setApps(appList);
      setUser(name);
      setLoaded(true);
    });
    const unsubscribe = system.onChange((event) => {
      if (event.action.type.startsWith('session.')) void refresh();
    });
    return () => { active = false; unsubscribe(); };
  }, [system]);

  return { apps, session, user, loaded };
}
