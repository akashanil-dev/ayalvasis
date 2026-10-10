// App icons drawn as inline SVG, keyed by the `icon` field of a module's manifest.
// An unknown key is shown as text, so a module can still use a single emoji or glyph.

const ICONS: Record<string, () => React.JSX.Element> = {
  terminal: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="7" width="40" height="34" rx="5" fill="#241f31" stroke="#5e5c64" strokeWidth="2" />
    <rect x="4" y="7" width="40" height="7" rx="3" fill="#3d3846" />
    <path
      d="M12 22l7 5-7 5" fill="none" stroke="#8ff0a4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
    />
    <path d="M23 33h12" stroke="#deddda" strokeWidth="3" strokeLinecap="round" />
  </svg>,
  files: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M5 13a4 4 0 0 1 4-4h10l4 5h16a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#1c71d8" />
    <path d="M5 19h38v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#62a0ea" />
  </svg>,
  editor: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M11 5h19l9 9v27a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#f6f5f4" />
    <path d="M30 5v9h9" fill="#c0bfbc" />
    <path d="M14 21h20M14 27h20M14 33h13" stroke="#77767b" strokeWidth="2.5" strokeLinecap="round" />
  </svg>,
  'learn-linux': () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 9 3 19l21 10 21-10z" fill="#33d17a" />
    <path d="M11 24v9c0 3 6 7 13 7s13-4 13-7v-9l-13 6z" fill="#26a269" />
    <path d="M41 21v12" stroke="#f6d32d" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="41" cy="35" r="2.5" fill="#f6d32d" />
  </svg>,
  about: () => <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="19" fill="#613583" />
    <circle cx="24" cy="15" r="3" fill="#fff" />
    <path d="M24 21v14" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
  </svg>,
};

export function AppIcon({ name }: { name: string }) {
  const Icon = ICONS[name];
  return <span className="app-icon">{Icon ? <Icon /> : name}</span>;
}
