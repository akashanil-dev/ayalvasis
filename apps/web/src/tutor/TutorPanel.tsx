import type { SystemClient } from '@tuxos/system';
import type { Autonomy, Transport } from '@tuxos/tutor';
import { useEffect, useRef, useState } from 'react';
import { PointerOverlay } from './PointerOverlay';
import { Puppet } from './Puppet';
import { useStuckNudge } from './useStuckNudge';
import { useTutor, type Entry } from './useTutor';

const LEVELS: { id: Autonomy; label: string; help: string }[] = [
  { id: 'guide', label: 'Guide', help: 'Vasi looks, explains, opens apps and points at things.' },
  { id: 'demo', label: 'Demo', help: 'Vasi may also run commands in its own terminal to show you how.' },
  { id: 'drive', label: 'Drive', help: 'Vasi may also start lessons and write files for you.' },
];

export function TutorPanel({ system, transport }: { system: SystemClient; transport: Transport }) {
  const tutor = useTutor(system, transport);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { nudge, dismiss } = useStuckNudge(system);
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView?.({ block: 'end' });
  }, [tutor.entries.length, tutor.busy]);

  const ask = (question: string) => {
    setOpen(true);
    dismiss();
    tutor.ask(question);
  };

  return <>
    <PointerOverlay pointer={tutor.pointer} onDone={tutor.clearPointer} />
    {open && <section className="tutor-panel" aria-label="Vasi, your Linux tutor">
      <header>
        <strong>Vasi</strong>
        <span>your Linux neighbour</span>
        <button aria-label="Close tutor" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="tutor-levels" role="radiogroup" aria-label="How much Vasi may do">
        {LEVELS.map((level) => <button
          key={level.id}
          role="radio"
          aria-checked={tutor.autonomy === level.id}
          title={level.help}
          onClick={() => tutor.setAutonomy(level.id)}
        >{level.label}</button>)}
      </div>
      <p className="tutor-level-help">{LEVELS.find((level) => level.id === tutor.autonomy)?.help}</p>
      <ol className="tutor-log" ref={log}>
        {!tutor.entries.length && <li className="tutor-hello">
          Hi! I&apos;m Vasi. Ask me anything about Linux, or what went wrong with a command.
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
    case 'run_command':
      return <>
        <span>⌨ Ran in Vasi&apos;s terminal</span>
        <pre><code>$ {arg('command')}{'\n'}{result.stdout}{result.stderr}</code></pre>
        {failed}
      </>;
    case 'open_app': return <span>🪟 Opened {arg('app')}{failed}</span>;
    case 'point_at': return <span>👉 Pointed at {arg('target').replace(/^(app|window):/, '')}{failed}</span>;
    case 'read_file': return <span>📄 Read <code>{arg('path')}</code>{failed}</span>;
    case 'list_directory': return <span>📁 Looked in <code>{arg('path')}</code>{failed}</span>;
    case 'write_file': return <span>✏️ Wrote <code>{arg('path')}</code>{failed}</span>;
    case 'close_window': return <span>✖ Closed a window{failed}</span>;
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
