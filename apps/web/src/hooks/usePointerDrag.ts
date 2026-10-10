import { useRef } from 'react';

interface PointerHandlers {
  onPointerDown(event: React.PointerEvent): void;
  onPointerMove(event: React.PointerEvent): void;
  onPointerUp(event: React.PointerEvent): void;
}

export function usePointerDrag(
  onMove: (event: React.PointerEvent) => void,
  onEnd: (event: React.PointerEvent) => void,
): PointerHandlers {
  const active = useRef(false);

  return {
    onPointerDown(event) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      active.current = true;
      onMove(event);
    },
    onPointerMove(event) {
      if (active.current) onMove(event);
    },
    onPointerUp(event) {
      if (!active.current) return;
      active.current = false;
      onEnd(event);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
  };
}
