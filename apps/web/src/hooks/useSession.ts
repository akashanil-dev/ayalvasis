import type { AppContribution } from '@tuxos/sdk';
import type { SessionState } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import { useEffect, useState } from 'react';

const emptySession: SessionState = { windows: [], focusedId: null, nextId: 1 };

export function useSession(system: SystemClient) {
  const [apps, setApps] = useState<(AppContribution & { moduleId: string })[]>([]);
  const [session, setSession] = useState<SessionState>(emptySession);

  useEffect(() => {
    let active = true;
    void system.apps().then((value) => { if (active) setApps(value); });
    void system.session().then((value) => { if (active) setSession(value); });
    const unsubscribe = system.onChange((event) => {
      if (!event.action.type.startsWith('session.')) return;
      void system.session().then((value) => { if (active) setSession(value); });
    });
    return () => { active = false; unsubscribe(); };
  }, [system]);

  return { apps, session };
}
