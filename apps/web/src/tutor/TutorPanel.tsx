import type { SystemClient } from '@tuxos/system';
import type { Transport } from '@tuxos/tutor';
import { useEffect, useRef, useState } from 'react';
import { PointerOverlay } from './PointerOverlay';
import { Puppet } from './Puppet';
import { SudoDialog } from './SudoDialog';
import { useStuckNudge } from './useStuckNudge';
import { useTutor, type CursorState, type Entry } from './useTutor';

export function TutorPanel({ system, transport, verifySudo = null }: {
  system: SystemClient;
  transport: Transport;
  /** Checks the signed-in account's password; null for guests. */
  verifySudo?: ((password: string) => Promise<boolean>) | null;
}) {
  const tutor = useTutor(system, transport);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { nudge, dismiss } = useStuckNudge(system);
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView?.({ block: 'end' });
  }, [tutor.entries.length, tutor.busy]);

  // Escape takes back control. Only a real key press counts: Vasi's own key presses are synthetic.
  const { busy, stop } = tutor;
  useEffect(() => {
    if (!busy) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && event.isTrusted) stop(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, stop]);

  const ask = (question: string) => {
    setOpen(true);
    dismiss();
    tutor.ask(question);
  };

  return <>
    <PointerOverlay pointer={tutor.pointer} onDone={tutor.clearPointer} />
    <VasiCursor cursor={tutor.cursor} />
    {tutor.busy && <div className="vasi-control" role="status">
      <span className="vasi-control-dot" />
      <span>{tutor.acting ? 'Vasi is using the computer' : 'Vasi is thinking…'}</span>
      <button onClick={tutor.stop}>Stop <kbd>Esc</kbd></button>
    </div>}
    {tutor.sudoRequest && <SudoDialog system={system} request={tutor.sudoRequest} verify={verifySudo} />}
    {open && <section className="tutor-panel" aria-label="Vasi, your Linux tutor">
      <header>
        <strong>Vasi</strong>
        <span>your Linux teacher</span>
        {tutor.hasSudo && <button
          className="tutor-sudo"
          title="Vasi can use sudo. Click to take it back."
          onClick={tutor.revokeSudo}
        >sudo · Revoke</button>}
        <button aria-label="Close tutor" onClick={() => setOpen(false)}>×</button>
      </header>
      <ol className="tutor-log" ref={log}>
        {!tutor.entries.length && <li className="tutor-hello">
          Hi! I&apos;m Vasi, your Linux teacher. Ask me anything, or ask me to show you how something works.
          I can use this computer too, but you&apos;ll do the learning.
        </li>}
        {tutor.entries.map((entry, index) => <EntryView key={index} entry={entry} />)}
        {tutor.busy && <li className="tutor-thinking" role="status">Vasi is thinking…</li>}
      </ol>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!draft.trim() || tutor.busy) return;
        ask(draft);
        setDraft('');
      }}>
        <input
          aria-label="Ask Vasi"
          placeholder={tutor.busy ? 'Vasi is answering…' : 'Ask about a command, an error, a lesson…'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={tutor.busy || !draft.trim()}>Ask</button>
      </form>
    </section>}
    {nudge && !open && <button className="tutor-nudge" onClick={() => ask(nudge.question)}>
      {nudge.text} <span>Ask Vasi</span>
    </button>}
    <button
      className={`tutor-puppet ${tutor.busy ? 'busy' : ''} ${tutor.pointer ? 'pointing' : ''}`}
      aria-label={open ? 'Hide Vasi' : 'Ask Vasi, your Linux tutor'}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <Puppet />
    </button>
  </>;
}

/** Vasi's own pointer: it glides to what he is about to click, and ripples when he clicks. */
function VasiCursor({ cursor }: { cursor: CursorState }) {
  if (!cursor.visible) return null;
  return <div
    className={`vasi-cursor ${cursor.clicking ? 'clicking' : ''}`}
    style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L9.8 21z" /></svg>
    <span>Vasi</span>
  </div>;
}

function EntryView({ entry }: { entry: Entry }) {
  if (entry.kind === 'error') return <li className="tutor-error" role="alert">{entry.text}</li>;
  if (entry.kind === 'tool') return <li className="tutor-tool"><ToolSummary entry={entry} /></li>;
  return <li className={`tutor-message ${entry.role}`}><Formatted text={entry.text} /></li>;
}

/** What the tutor just did, in words a learner understands. Commands show their output like a terminal. */
function ToolSummary({ entry }: { entry: Extract<Entry, { kind: 'tool' }> }) {
  const result = entry.result as { error?: string; exit_code?: number; stdout?: string; stderr?: string };
  const failed = result?.error ? <span className="tutor-tool-error"> — {result.error}</span> : null;
  const arg = (key: string) => String(entry.args[key] ?? '');
  switch (entry.name) {
    case 'type_in_terminal':
      return <>
        <span>⌨ Typed in a terminal</span>
        <pre><code>$ {arg('command')}{'\n'}{result.stdout}{result.stderr}</code></pre>
        {failed}
      </>;
    case 'run_command':
      return <>
        <span>🔍 Checked quietly</span>
        <pre><code>$ {arg('command')}{'\n'}{result.stdout}{result.stderr}</code></pre>
        {failed}
      </>;
    case 'open_app': return <span>🪟 Opened {arg('app')}{failed}</span>;
    case 'point_at': return <span>👉 Pointed at {arg('target').replace(/^(app|window):/, '')}{failed}</span>;
    case 'read_file': return <span>📄 Read <code>{arg('path')}</code>{failed}</span>;
    case 'list_directory': return <span>📁 Looked in <code>{arg('path')}</code>{failed}</span>;
    case 'write_file': return <span>✏️ Wrote <code>{arg('path')}</code>{failed}</span>;
    case 'close_window': return <span>✖ Closed a window{failed}</span>;
    case 'click': return <span>🖱 {entry.args.double_click ? 'Double-clicked' : 'Clicked'} something{failed}</span>;
    case 'type_text': return <span>⌨ Typed <code>{arg('text')}</code>{failed}</span>;
    case 'press_keys': return <span>⌨ Pressed <kbd>{arg('keys')}</kbd>{failed}</span>;
    case 'manage_window': return <span>🪟 {arg('action')} a window{failed}</span>;
    case 'change_appearance': return <span>🎨 Changed the desktop{failed}</span>;
    case 'request_sudo': {
      const granted = (entry.result as { granted?: boolean })?.granted;
      return <span>🔐 Asked for sudo: {granted ? 'you said yes' : 'you said no'}{failed}</span>;
    }
    case 'look_at_screen': return <span>👀 Looked at your screen{failed}</span>;
    case 'recent_activity': return <span>🕘 Checked your recent commands{failed}</span>;
    default: return <span>⚙ {entry.name.replace('__', ': ').replace(/_/g, ' ')}{failed}</span>;
  }
}

/** Just enough Markdown for chat replies: `code`, **bold** and line breaks (kept by CSS). */
function Formatted({ text }: { text: string }) {
  return <>{text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
    const wrapped = (mark: string) => part.length > mark.length * 2 && part.startsWith(mark) && part.endsWith(mark);
    if (wrapped('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (wrapped('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <span key={index}>{part}</span>;
  })}</>;
}
