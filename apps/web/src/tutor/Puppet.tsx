/** Vasi, drawn as a small round penguin. */
export function Puppet() {
  return <svg viewBox="0 0 64 64" aria-hidden="true" className="puppet-svg">
    <ellipse cx="32" cy="60" rx="16" ry="3" fill="rgb(0 0 0 / 25%)" />
    <path d="M32 6c-12 0-19 10-19 24 0 15 7 26 19 26s19-11 19-26C51 16 44 6 32 6z" fill="#241f31" />
    <path d="M32 20c-8 0-12 8-12 17 0 10 5 16 12 16s12-6 12-16c0-9-4-17-12-17z" fill="#f6f5f4" />
    <g className="puppet-eyes">
      <circle cx="26" cy="22" r="3.2" fill="#f6f5f4" />
      <circle cx="38" cy="22" r="3.2" fill="#f6f5f4" />
      <circle cx="26.8" cy="22.6" r="1.6" fill="#241f31" />
      <circle cx="38.8" cy="22.6" r="1.6" fill="#241f31" />
    </g>
    <path d="M27 28l5 4 5-4z" fill="#f5a524" />
    <path className="puppet-wing" d="M13 32c-5 4-6 12-4 16 3-2 6-8 6-14z" fill="#241f31" />
    <path d="M51 32c5 4 6 12 4 16-3-2-6-8-6-14z" fill="#241f31" />
    <path d="M22 54c-3 0-5 2-3 4h9c1-2-2-4-6-4zM42 54c3 0 5 2 3 4h-9c-1-2 2-4 6-4z" fill="#f5a524" />
  </svg>;
}
