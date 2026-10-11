import { useEffect, useRef, useState } from 'react';

const SIZE = 64;
const MARGIN = 14;
/** Walking speed, in pixels per second: an unhurried waddle. */
const SPEED = 70;
/** How long Vasi stands still between strolls. */
const PAUSE_MS = { min: 9_000, max: 20_000 };
const FIRST_PAUSE_MS = 4_000;

export interface Stroll {
  /** Vasi's left edge, in pixels from the left of the screen. */
  x: number;
  facing: 'left' | 'right' | 'front';
  walking: boolean;
  /** How long the current walk takes, for the CSS transition. */
  durationMs: number;
}

const home = () => Math.max(MARGIN, globalThis.innerWidth - SIZE - MARGIN);

/**
 * Vasi's stroll along the bottom of the screen. While `free` he now and then waddles to another spot, and back home
 * to the right corner; as soon as he is needed (a chat, a nudge, his introduction, his work) he walks home and turns
 * to face the learner. Reduced motion keeps him at home.
 */
export function useStroll(free: boolean): Stroll {
  const [stroll, setStroll] = useState<Stroll>(() => ({ x: home(), facing: 'front', walking: false, durationMs: 0 }));
  const position = useRef(stroll.x);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const walkTo = (target: number, then?: () => void) => {
      const from = position.current;
      const durationMs = Math.round((Math.abs(target - from) / SPEED) * 1000);
      if (durationMs < 50) {
        setStroll({ x: target, facing: 'front', walking: false, durationMs: 0 });
        then?.();
        return;
      }
      position.current = target;
      setStroll({ x: target, facing: target < from ? 'left' : 'right', walking: true, durationMs });
      timers.push(setTimeout(() => {
        setStroll((current) => ({ ...current, facing: 'front', walking: false }));
        then?.();
      }, durationMs));
    };

    if (!free || still) {
      walkTo(home());
      return () => timers.forEach(clearTimeout);
    }
    const wander = (pause = PAUSE_MS.min + Math.random() * (PAUSE_MS.max - PAUSE_MS.min)) => {
      timers.push(setTimeout(() => {
        // Mostly explore somewhere along the bottom; sometimes go back to his corner (never "home" from home).
        const width = globalThis.innerWidth;
        const atHome = Math.abs(position.current - home()) < 40;
        const target = !atHome && Math.random() < 0.3 ? home() : MARGIN + Math.random() * Math.max(0, width - SIZE - MARGIN * 2);
        walkTo(Math.round(target), () => wander());
      }, pause));
    };
    // The first stroll comes soon after he is free, so he doesn't seem frozen.
    wander(FIRST_PAUSE_MS);
    return () => timers.forEach(clearTimeout);
  }, [free, still]);

  // Keep him on screen when the window shrinks.
  useEffect(() => {
    const onResize = () => {
      if (position.current > home()) {
        position.current = home();
        setStroll((current) => ({ ...current, x: home(), durationMs: 0 }));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return stroll;
}
