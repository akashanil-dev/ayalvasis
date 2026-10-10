import type { Window as SessionWindow } from '@tuxos/kernel';
import type { SystemClient } from '@tuxos/system';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePointerDrag } from '../hooks/usePointerDrag';
import { getLazyView } from '../views';

export interface Insets {
  top: number;
  bottom: number;
}

interface WindowFrameProps {
  system: SystemClient;
  window: SessionWindow;
  focused: boolean;
  /** Space the desktop's panels take, which windows keep clear of. */
  insets: Insets;
  /** Window decorations: KDE's Breeze (icon, title, three buttons) or GNOME's Adwaita (title, close only). */
  decoration: 'breeze' | 'adwaita';
  icon?: React.ReactNode;
}

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
export function WindowFrame({ system, window, focused, insets, decoration, icon }: WindowFrameProps) {
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
      insets,
    );
    setPreview((current) => ({ ...current, ...position }));
  };
  const finishMove = (event: React.PointerEvent) => {
    const position = clampPosition(
      pointerX(event) - dragOrigin.current.x,
      pointerY(event) - dragOrigin.current.y,
      preview.width,
      insets,
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
  const style = window.maximized ? maximizedStyle(insets) : {
    left: preview.x,
    top: preview.y,
    width: preview.width,
    height: preview.height,
  };

  return <section
    className={`app-window deco-${decoration} ${focused ? 'focused' : ''} ${window.maximized ? 'maximized' : ''}`}
    style={{ ...style, zIndex: window.z, display: window.minimized ? 'none' : undefined }}
    aria-hidden={window.minimized || undefined}
    data-tutor-target={`window:${window.id}`}
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
      {decoration === 'breeze' && <span className="window-app-icon">{icon}</span>}
      <span className="window-title">{window.title}</span>
      <div className="window-buttons">
        {/* GNOME shows only a close button by default; KDE's Breeze shows all three. */}
        {decoration === 'breeze' && <>
          <WindowButton
            label={`Minimize ${window.title}`}
            kind="minimize"
            onClick={() => void system.dispatch('session.minimize', { id: window.id })}
            onPointerDown={stopPointer}
          />
          <WindowButton
            label={`Maximize ${window.title}`}
            kind="maximize"
            onClick={() => void system.dispatch('session.toggleMaximize', { id: window.id })}
            onPointerDown={stopPointer}
          />
        </>}
        <WindowButton label={`Close ${window.title}`} kind="close" onClick={close} onPointerDown={stopPointer} />
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

const GLYPHS = {
  minimize: <path d="M4 8.5h8" />,
  maximize: <path d="M4.5 9.5 8 6l3.5 3.5" />,
  close: <path d="M5 5l6 6M11 5l-6 6" />,
};

function WindowButton({ label, kind, onClick, onPointerDown }: {
  label: string;
  kind: keyof typeof GLYPHS;
  onClick(): void;
  onPointerDown(event: React.PointerEvent): void;
}) {
  return <button aria-label={label} className={`window-button ${kind}`} onClick={onClick} onPointerDown={onPointerDown}>
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {GLYPHS[kind]}
    </svg>
  </button>;
}

function geometryOf(window: SessionWindow): Geometry {
  return { x: window.x, y: window.y, width: window.width, height: window.height };
}

/** Keep at least 40px of the title bar on screen, and never under a panel. */
function clampPosition(x: number, y: number, width: number, insets: Insets) {
  const desktopWidth = globalThis.innerWidth;
  const bottom = globalThis.innerHeight - insets.bottom;
  return {
    x: Math.min(desktopWidth - 40, Math.max(40 - width, x)),
    y: Math.min(bottom - 40, Math.max(insets.top, y)),
  };
}

function maximizedStyle(insets: Insets) {
  return {
    left: 0,
    top: insets.top,
    width: Math.max(MIN_WIDTH, globalThis.innerWidth),
    height: Math.max(MIN_HEIGHT, globalThis.innerHeight - insets.top - insets.bottom),
  };
}

function pointerX(event: React.PointerEvent): number {
  return Number.isFinite(event.clientX) ? event.clientX : 0;
}

function pointerY(event: React.PointerEvent): number {
  return Number.isFinite(event.clientY) ? event.clientY : 0;
}
