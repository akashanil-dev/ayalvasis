import { useEffect, useState } from 'react';
import type { Pointer } from './useTutor';

const SHOW_MS = 6000;

/**
 * Draws a pulsing ring around whatever the tutor points at. Things it can point at carry a
 * `data-tutor-target` attribute: `app:<id>` on desktop icons and `window:<id>` on windows.
 */
export function PointerOverlay({ pointer, onDone }: { pointer: Pointer | null; onDone(): void }) {
  const [box, setBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!pointer) return setBox(null);
    const element = [...document.querySelectorAll('[data-tutor-target]')]
      .find((candidate) => candidate.getAttribute('data-tutor-target') === pointer.target);
    setBox(element ? element.getBoundingClientRect() : null);
    // A desktop icon may sit under open windows: lift it above them while it is being pointed at.
    element?.classList.add('tutor-raised');
    const timer = setTimeout(onDone, SHOW_MS);
    return () => {
      clearTimeout(timer);
      element?.classList.remove('tutor-raised');
    };
  }, [pointer, onDone]);

  if (!pointer || !box) return null;
  return <div
    className="tutor-pointer"
    role="status"
    style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }}
  >
    {pointer.note && <span className="tutor-pointer-note">{pointer.note}</span>}
  </div>;
}
