import type { AppViewProps } from '@ayalvasis/system';
import { useEffect, useRef, useState } from 'react';
import './editor.css';

const REASONS: Record<string, string> = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  EISDIR: 'Is a directory',
  ENOTDIR: 'Not a directory',
};

export default function EditorView({ system, windowId, args, setCloseGuard }: AppViewProps) {
  const [path, setPath] = useState(args?.path ?? '');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [problem, setProblem] = useState<{ message: string; tip?: string } | null>(null);
  const [savingAs, setSavingAs] = useState<string | null>(null);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== saved;

  useEffect(() => {
    if (!args?.path) return;
    void system.dispatch<string>('fs.read', { path: args.path }).then((result) => {
      if (result.ok) {
        setText(result.value);
        setSaved(result.value);
      } else if (result.error.code !== 'ENOENT') {
        // A missing file is fine: like gedit, saving creates it.
        setProblem({ message: `Couldn’t open “${args.path}”: ${REASONS[result.error.code] ?? result.error.message}` });
      }
    });
  }, [system, args?.path]);

  useEffect(() => {
    const name = path ? path.slice(path.lastIndexOf('/') + 1) : 'Untitled Document';
    void system.dispatch('session.setTitle', { id: windowId, title: `${dirty ? '• ' : ''}${name} — Text Editor` });
  }, [system, windowId, path, dirty]);

  useEffect(() => {
    setCloseGuard?.(dirty ? () => globalThis.confirm('Discard unsaved changes?') : null);
    return () => setCloseGuard?.(null);
  }, [dirty, setCloseGuard]);

  async function save(target: string) {
    const result = await system.dispatch('fs.write', { path: target, content: text });
    if (!result.ok) {
      const denied = result.error.code === 'EACCES';
      setProblem({
        message: `Couldn’t save “${target}”: ${REASONS[result.error.code] ?? result.error.message}`,
        tip: denied ? 'Tip: this file belongs to root. In the terminal, try sudo.' : undefined,
      });
      return;
    }
    setPath(target);
    setSaved(text);
    setSavingAs(null);
    setProblem(null);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (path) void save(path);
      else void system.user().then((user) => setSavingAs(`/home/${user}/untitled.txt`));
    }
  }

  function track() {
    const element = area.current;
    if (!element) return;
    const before = element.value.slice(0, element.selectionStart);
    const lines = before.split('\n');
    setPosition({ line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 });
  }

  return <div className="editor-view" onKeyDown={onKeyDown}>
    {savingAs !== null && <form className="editor-bar" onSubmit={(event) => {
      event.preventDefault();
      if (savingAs.startsWith('/')) void save(savingAs);
      else setProblem({ message: 'Give the full path, starting with /' });
    }}>
      <label>Save as <input autoFocus value={savingAs} onChange={(event) => setSavingAs(event.target.value)} /></label>
      <button type="submit">Save</button>
      <button type="button" onClick={() => setSavingAs(null)}>Cancel</button>
    </form>}
    {problem && <div className="editor-bar editor-problem" role="alert">
      <span>{problem.message}</span>
      {problem.tip && <span className="editor-tip">{problem.tip}</span>}
    </div>}
    <textarea
      ref={area}
      aria-label="File contents"
      spellCheck={false}
      value={text}
      onChange={(event) => { setText(event.target.value); track(); }}
      onKeyUp={track}
      onClick={track}
    />
    <footer className="editor-status">
      <span>{path || 'Not saved yet'}</span>
      <span>Ln {position.line}, Col {position.column} · Ctrl+S to save</span>
    </footer>
  </div>;
}
