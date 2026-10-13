import { DESKTOPS, WALLPAPERS, desktopById } from '@tuxos/appearance';
import type { AiKeyStore, AiStatus, AppViewProps } from '@tuxos/system';
import { useEffect, useState, type FormEvent } from 'react';
import './settings.css';

/** Settings: pick any desktop environment or wallpaper at any time, and see what this system is. */
export default function SettingsView({ system }: AppViewProps) {
  const [current, setCurrent] = useState({ desktop: '', wallpaper: '' });
  const [about, setAbout] = useState({ user: '', hostname: '' });

  useEffect(() => {
    const load = () => void system.session().then(({ desktop, wallpaper }) => setCurrent({ desktop, wallpaper }));
    load();
    void Promise.all([system.user(), system.hostname()]).then(([user, hostname]) => setAbout({ user, hostname }));
    return system.onChange((event) => { if (event.action.type.startsWith('session.set')) load(); });
  }, [system]);

  return <div className="settings">
    <h3>Desktop environment</h3>
    <p className="settings-intro">
      On Linux the desktop itself is a program you can swap. Each one arranges windows, panels and menus its own
      way, while your files and apps stay the same. Try them all, any time.
    </p>
    <div className="theme-grid">
      {DESKTOPS.map((desktop) => {
        const inUse = desktop.id === current.desktop;
        return <button
          key={desktop.id}
          className={`theme-card ${inUse ? 'active' : ''}`}
          aria-pressed={inUse}
          aria-label={inUse ? `${desktop.name}, in use` : `Switch to ${desktop.name}`}
          onClick={() => { if (!inUse) void system.dispatch('session.setDesktop', { desktop: desktop.id }); }}
        >
          <span className={`theme-preview tp-${desktop.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>{desktop.name}</strong>
          <small>{desktop.version}{inUse ? ' · in use' : ''}</small>
          <small>{desktop.summary}</small>
          <small className="theme-used">Used by: {desktop.usedBy}</small>
        </button>;
      })}
    </div>

    <h3>Wallpaper</h3>
    <div className="wall-grid" role="radiogroup" aria-label="Wallpaper">
      {WALLPAPERS.map((wallpaper) => <button
        key={wallpaper.id}
        role="radio"
        aria-checked={wallpaper.id === current.wallpaper}
        aria-label={`Wallpaper: ${wallpaper.name}`}
        className={`wall ${wallpaper.id === current.wallpaper ? 'active' : ''}`}
        style={{ background: wallpaper.thumbnail }}
        onClick={() => void system.dispatch('session.setWallpaper', { wallpaper: wallpaper.id })}
      >{wallpaper.name}</button>)}
    </div>

    {system.ai() && <AiKeySection store={system.ai()!} />}

    <h3>Plugins</h3>
    <p className="settings-intro">Add useful tools to your desktop and manage their permissions.</p>
    <button onClick={() => void system.openApp('plugins')}>Open Plugins</button>

    <h3>About this system</h3>
    <div className="about-system">
      <dl className="about-specs">
        <dt>Operating system</dt><dd>TuxOS 1.0</dd>
        <dt>Kernel</dt><dd>Linux 6.10.0-tuxos</dd>
        <dt>Desktop</dt><dd>{current.desktop && `${desktopById(current.desktop).name} (${desktopById(current.desktop).version})`}</dd>
        <dt>Hostname</dt><dd>{about.hostname}</dd>
        <dt>User</dt><dd>{about.user}</dd>
      </dl>
      <p className="about-blurb">TuxOS runs entirely in your browser. Nothing on your real computer is changed.</p>
    </div>
  </div>;
}

/** The learner's own OpenAI API key, which turns on Vasi and the AI trainers. */
function AiKeySection({ store }: { store: AiKeyStore }) {
  const [status, setStatus] = useState<AiStatus>(() => store.status());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => store.onChange(setStatus), [store]);

  const run = async (work: () => Promise<AiStatus>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await work());
      setDraft('');
      setMessage({ error: false, text: done });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) void run(() => store.save(draft), 'Key checked and saved. Vasi and the AI trainers are on.');
  };
  const own = status.source === 'account' || status.source === 'browser';

  return <>
    <h3>AI</h3>
    <p className="settings-intro">
      Vasi and the AI trainers run on OpenAI, using your own API key, so you only pay for what you use. Without a
      key everything else still works, and Learn Linux uses its built-in lessons.
    </p>
    <div className="ai-key">
      <p className={`ai-key-state ${status.enabled ? 'on' : 'off'}`} role="status">
        {own ? <>AI is on with your key <code>{status.hint}</code>{status.source === 'browser' ? ', kept in this browser.' : ', saved with your account.'}</>
          : status.source === 'server' ? 'AI is on: this server provides it. You can still use your own key.'
            : 'AI is off: add an OpenAI API key to turn it on.'}
      </p>
      <form onSubmit={save}>
        <input
          type="password"
          aria-label="OpenAI API key"
          placeholder={own ? 'Paste a new key to replace it' : 'sk-…'}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Checking…' : own ? 'Replace key' : 'Save key'}</button>
        {own && <button type="button" disabled={busy} onClick={() => void run(() => store.remove(), 'Key removed.')}>Remove key</button>}
      </form>
      {message && <p className={`ai-key-message ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <p className="ai-key-help">
        Create a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>.
        {status.signedIn
          ? ' It is stored encrypted with your account and only used for your own requests; TuxOS never shows it again.'
          : ' As a guest, it is kept only in this browser and sent with your own AI requests. Sign in to keep it with an account.'}
      </p>
    </div>
  </>;
}
