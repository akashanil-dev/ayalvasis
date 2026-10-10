import type { SystemClient } from '@ayalvasis/system';
import { TutorSession, type Autonomy, type Transport, type TutorEvent } from '@ayalvasis/tutor';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type Entry =
  | { kind: 'message'; role: 'user' | 'assistant'; text: string }
  | { kind: 'tool'; name: string; args: Record<string, unknown>; result: unknown }
  | { kind: 'error'; text: string };

export interface Pointer {
  target: string;
  note?: string;
  at: number;
}

const AUTONOMY_KEY = 'ayalvasis.tutor.autonomy';

/** The tutor conversation for this desktop: messages, tool actions, busy state and where it is pointing. */
export function useTutor(system: SystemClient, transport: Transport) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const [autonomy, setAutonomyState] = useState<Autonomy>(savedAutonomy);

  const session = useMemo(() => new TutorSession({
    access: system.tutor(),
    transport,
    autonomy: savedAutonomy(),
    ui: { pointAt: (target, note) => setPointer({ target, note, at: Date.now() }) },
  }), [system, transport]);

  useEffect(() => session.on((event: TutorEvent) => {
    if (event.type === 'busy') setBusy(event.busy);
    else if (event.type === 'message') {
      setEntries((list) => [...list, { kind: 'message', role: event.role, text: event.text }]);
    }
    else if (event.type === 'tool') setEntries((list) => [...list, { kind: 'tool', ...event }]);
    else setEntries((list) => [...list, { kind: 'error', text: event.message }]);
  }), [session]);

  const setAutonomy = (level: Autonomy) => {
    session.setAutonomy(level);
    setAutonomyState(level);
    try {
      localStorage.setItem(AUTONOMY_KEY, level);
    } catch {
      // Remembering the choice is a convenience; the tutor works without it.
    }
  };

  const clearPointer = useCallback(() => setPointer(null), []);

  return {
    entries, busy, pointer, autonomy, setAutonomy, clearPointer,
    ask: (question: string) => void session.ask(question),
  };
}

function savedAutonomy(): Autonomy {
  try {
    const value = localStorage.getItem(AUTONOMY_KEY);
    if (value === 'guide' || value === 'demo' || value === 'drive') return value;
  } catch {
    // Storage can be unavailable (private windows); fall back to the safest level.
  }
  return 'guide';
}
