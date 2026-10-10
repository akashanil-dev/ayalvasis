import { useEffect, useRef } from 'react';

/** A menu entry, a separator line, or a heading (CDE's menus have titles). */
export type MenuItem = { label: string; icon?: string; run(): void } | 'separator' | { heading: string };

/**
 * A popup menu at a screen position: right-click menus and power menus. Escape or a click outside
 * closes it; arrow keys move between items.
 */
export function PopupMenu({ x, y, items, onClose, className = '' }: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
  className?: string;
}) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.querySelector('button')?.focus();
    const away = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const buttons = [...(menu.current?.querySelectorAll('button') ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
      next?.focus();
      event.preventDefault();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  // Keep the menu on screen near the edges.
  const left = Math.min(x, globalThis.innerWidth - 240);
  const top = Math.min(y, globalThis.innerHeight - 40 - items.length * 34);
  return <div ref={menu} className={`popup-menu ${className}`} role="menu" style={{ left, top }}>
    {items.map((item, index) => {
      if (item === 'separator') return <hr key={index} />;
      if ('heading' in item) return <p key={index} className="popup-title">{item.heading}</p>;
      return <button key={item.label} role="menuitem" onClick={() => { onClose(); item.run(); }}>{item.label}</button>;
    })}
  </div>;
}
