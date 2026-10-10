import type { Window as SessionWindow } from '@ayalvasis/kernel';
import type { SystemClient } from '@ayalvasis/system';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePointerDrag } from '../hooks/usePointerDrag';
import { getLazyView } from '../views';

interface WindowFrameProps {
  system: SystemClient;
  window: SessionWindow;
  focused: boolean;
}

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const PANEL_HEIGHT = 56;

export function WindowFrame({ system, window, focused }: WindowFrameProps) {
  const [preview, setPreview] = useState<Geometry>(() => geometryOf(window));
  const dragOrigin = useRef({ x: 0, y: 0 });
  const resizeOrigin = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const View = getLazyView(window.appId);
  const closeGuard = useRef<(() => boolean) | null>(null);
  const setCloseGuard = useCallback((guard: (() => boolean) | null) => { closeGuard.current = guard; }, []);
  const close = () => {
    if (closeGuard.current && !closeGuard.current()) return;
    void system.dispatch('session.close', { id: window.id });
  };

  useEffect(() => {
    setPreview(geometryOf(window));
  }, [window.x, window.y, window.width, window.height]);

  const movePreview = (event: React.PointerEvent) => {
    const position = clampPosition(
      pointerX(event) - dragOrigin.current.x,
      pointerY(event) - dragOrigin.current.y,
      preview.width,
      preview.height,
    );
    setPreview((current) => ({ ...current, ...position }));
  };
  const finishMove = (event: React.PointerEvent) => {
    const position = clampPosition(
      pointerX(event) - dragOrigin.current.x,
      pointerY(event) - dragOrigin.current.y,
      preview.width,
      preview.height,
    );
    setPreview((current) => ({ ...current, ...position }));
    void system.dispatch('session.move', { id: window.id, ...position });
  };
  const drag = usePointerDrag(movePreview, finishMove);

  const resizePreview = (event: React.PointerEvent) => {
    const width = Math.max(MIN_WIDTH, resizeOrigin.current.width + pointerX(event) - resizeOrigin.current.x);
    const height = Math.max(MIN_HEIGHT, resizeOrigin.current.height + pointerY(event) - resizeOrigin.current.y);
    setPreview((current) => ({ ...current, width, height }));
  };
  const finishResize = (event: React.PointerEvent) => {
    const width = Math.max(MIN_WIDTH, resizeOrigin.current.width + pointerX(event) - resizeOrigin.current.x);
    const height = Math.max(MIN_HEIGHT, resizeOrigin.current.height + pointerY(event) - resizeOrigin.current.y);
    setPreview((current) => ({ ...current, width, height }));
    void system.dispatch('session.resize', { id: window.id, width, height });
  };
  const resize = usePointerDrag(resizePreview, finishResize);

  const focus = () => {
    if (!focused) void system.dispatch('session.focus', { id: window.id });
  };
  const stopPointer = (event: React.PointerEvent) => event.stopPropagation();
  const style = window.maximized ? maximizedStyle() : {
    left: preview.x,
    top: preview.y,
    width: preview.width,
    height: preview.height,
  };

  return <section
    className={`app-window ${focused ? 'focused' : ''}`}
    style={{ ...style, zIndex: window.z, display: window.minimized ? 'none' : undefined }}
    aria-hidden={window.minimized || undefined}
    onPointerDown={focus}
  >
    <header
      onPointerDown={(event) => {
        dragOrigin.current = { x: pointerX(event) - preview.x, y: pointerY(event) - preview.y };
        drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onDoubleClick={() => void system.dispatch('session.toggleMaximize', { id: window.id })}
    >
      <span>{window.title}</span>
      <div>
        <WindowButton
          label={`Minimize ${window.title}`}
          onClick={() => void system.dispatch('session.minimize', { id: window.id })}
          onPointerDown={stopPointer}
        >−</WindowButton>
        <WindowButton
          label={`Maximize ${window.title}`}
          onClick={() => void system.dispatch('session.toggleMaximize', { id: window.id })}
          onPointerDown={stopPointer}
        >□</WindowButton>
        <WindowButton
          label={`Close ${window.title}`}
          onClick={close}
          onPointerDown={stopPointer}
        >×</WindowButton>
      </div>
    </header>
    <div className="window-content">
      {View ? <Suspense fallback={<p>Loading app...</p>}>
        <View system={system} windowId={window.id} args={window.args} setCloseGuard={setCloseGuard} />
      </Suspense> : <p>No view registered for {window.appId}</p>}
    </div>
    <button
      className="resize-handle"
      aria-label={`Resize ${window.title}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        resizeOrigin.current = {
          width: preview.width,
          height: preview.height,
          x: pointerX(event),
          y: pointerY(event),
        };
        resize.onPointerDown(event);
      }}
      onPointerMove={resize.onPointerMove}
      onPointerUp={resize.onPointerUp}
    />
  </section>;
}

function WindowButton({
  label,
  onClick,
  onPointerDown,
  children,
}: {
  label: string;
  onClick(): void;
  onPointerDown(event: React.PointerEvent): void;
  children: string;
}) {
  return <button aria-label={label} onClick={onClick} onPointerDown={onPointerDown}>{children}</button>;
}

function geometryOf(window: SessionWindow): Geometry {
  return { x: window.x, y: window.y, width: window.width, height: window.height };
}

function clampPosition(x: number, y: number, width: number, height: number) {
  const desktopWidth = globalThis.innerWidth;
  const desktopHeight = globalThis.innerHeight - PANEL_HEIGHT;
  return {
    x: Math.min(desktopWidth - 40, Math.max(40 - width, x)),
    y: Math.min(desktopHeight - 40, Math.max(0, y)),
  };
}

function maximizedStyle() {
  return {
    left: 0,
    top: 0,
    width: Math.max(MIN_WIDTH, globalThis.innerWidth),
    height: Math.max(MIN_HEIGHT, globalThis.innerHeight - PANEL_HEIGHT),
  };
}

function pointerX(event: React.PointerEvent): number {
  return Number.isFinite(event.clientX) ? event.clientX : 0;
}

function pointerY(event: React.PointerEvent): number {
  return Number.isFinite(event.clientY) ? event.clientY : 0;
}
