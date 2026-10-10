import type { SystemClient } from '@ayalvasis/system';
import { useEffect, useState } from 'react';

export interface Nudge {
  text: string;
  question: string;
}

const FAILURES_BEFORE_NUDGE = 2;

/**
 * Notices when the learner's commands fail twice in a row and offers help. It only offers: nothing is
 * sent to the AI until the learner clicks, so the tutor costs nothing while it isn't being used.
 */
export function useStuckNudge(system: SystemClient) {
  const [nudge, setNudge] = useState<Nudge | null>(null);

  useEffect(() => {
    let failures = 0;
    return system.subscribe((event) => {
      if (event.action.type !== 'shell.ran' || event.actor.kind !== 'user' || !event.ok) return;
      const { code, line } = event.action.payload as { code: number; line: string };
      failures = code === 0 ? 0 : failures + 1;
      if (code === 0) setNudge(null);
      else if (failures >= FAILURES_BEFORE_NUDGE) {
        setNudge({
          text: `“${line}” didn't work either.`,
          question: 'My last commands failed. What went wrong, and what should I try?',
        });
      }
    });
  }, [system]);

  return { nudge, dismiss: () => setNudge(null) };
}
