import type { LessonStatus } from '@tuxos/lessons';
import { TerminalSurface } from '@tuxos/module-terminal/view';
import type { SystemClient, TerminalResult, TerminalSession } from '@tuxos/system';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import './course.css';

/** The window for any course module: lesson list, the current step, hints, and progress as it happens. */
export function CourseView({ system, courseId }: { system: SystemClient; courseId: string }) {
  const { status, error, call } = useLessonStatus(system, courseId);
  const [chosen, setChosen] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const stepId = status?.active?.step.id;

  useEffect(() => setHintsShown(0), [stepId]);

  if (!status) return <div className="learn-view learn-loading">{error || 'Loading lessons…'}</div>;
  const active = status.active;
  const selected = status.lessons.find((lesson) => lesson.id === (chosen ?? active?.lesson.id))
    ?? status.lessons.find((lesson) => lesson.completed < lesson.steps) ?? status.lessons[0];

  return <div className="learn-view">
    <nav className="learn-lessons" aria-label="Lessons">
      <h2>{status.course.title}</h2>
      <ol>
        {status.lessons.map((lesson) => <li key={lesson.id}>
          <button
            className={lesson.id === selected?.id ? 'current' : ''}
            aria-current={lesson.id === active?.lesson.id ? 'step' : undefined}
            onClick={() => setChosen(lesson.id)}
          >
            <span className="learn-check" aria-hidden="true">{lesson.completed === lesson.steps ? '✓' : ''}</span>
            <span>{lesson.title}</span>
            <small>{lesson.completed}/{lesson.steps}</small>
          </button>
        </li>)}
      </ol>
    </nav>
    <section className="learn-main">
      {error && <p className="learn-error" role="alert">{error}</p>}
      {status.lastExplain && <p className="learn-explain" role="status">✓ {status.lastExplain}</p>}
      {active && active.lesson.id === selected?.id
        ? <>
          <h1>{active.lesson.title}</h1>
          <p className="learn-story">{active.lesson.story}</p>
          <ol className="learn-steps">
            {active.steps.map((step, index) => <li
              key={step.id}
              className={step.done ? 'done' : index === active.stepIndex ? 'now' : ''}
            >{step.task}</li>)}
          </ol>
          <div className="learn-task">
            <strong>Your task</strong>
            <p>{active.step.task}</p>
            {active.step.hints.slice(0, hintsShown).map((hint) => <p className="learn-hint" key={hint}>💡 {hint}</p>)}
            <div className="learn-actions">
              {hintsShown < active.step.hints.length
                && <button onClick={() => setHintsShown(hintsShown + 1)}>Show a hint</button>}
              <button onClick={() => void system.openApp('terminal')}>Open Terminal</button>
              <button className="quiet" onClick={() => void call('quit')}>Leave lesson</button>
            </div>
          </div>
        </>
        : selected && <LessonIntro
          title={selected.title}
          done={selected.completed === selected.steps}
          onStart={() => void call('start', { lesson: selected.id })}
          summary={status.course.summary}
        />}
    </section>
  </div>;
}

export type LabVariant = 'linux' | 'docker' | 'chmod';

/** Terminal-first course window: the generated task is always visible above the learner's shell. */
export function LearningLabView({ system, courseId, variant }: {
  system: SystemClient;
  courseId: string;
  variant: LabVariant;
}) {
  if (variant === 'linux') return <LinuxTerminalLab system={system} courseId={courseId} />;
  const { status, error, call } = useLessonStatus(system, courseId);
  const [selected, setSelected] = useState<string | null>(null);
  const terminal = useRef<LabTerminalHandle>(null);
  const active = status?.active;
  const teaching = useTaught(courseId, active?.step.id);
  const lesson = status?.lessons.find((item) => item.id === (selected ?? active?.lesson.id))
    ?? status?.lessons.find((item) => item.completed < item.steps) ?? status?.lessons[0];

  if (!status) return <div className="learn-view learn-loading">{error || 'Loading AI lab…'}</div>;
  return <div className={`learning-lab learning-lab-${variant}`}>
    <header className="lab-header">
      <div>
        <span className="lab-eyebrow">AI TRAINER · {variant === 'docker' ? 'PLATFORM ENGINEERING' : variant === 'chmod' ? 'SECURITY OPERATIONS' : 'LINUX CERTIFICATION'}</span>
        <h1>{status.course.title}</h1>
        <p>{status.course.summary}</p>
      </div>
      <LabProgress lessons={status.lessons} />
    </header>
    <div className="lab-layout">
      <aside className="lab-syllabus" aria-label="AI-generated syllabus">
        <div className="lab-section-label">Syllabus</div>
        {status.lessons.map((item, index) => <button
          key={item.id}
          className={item.id === lesson?.id ? 'selected' : ''}
          onClick={() => setSelected(item.id)}
        >
          <span className="lab-day">{String(index + 1).padStart(2, '0')}</span>
          <span className="lab-lesson-title">{item.title}</span>
          <small>{item.completed}/{item.steps}</small>
        </button>)}
        <p className="lab-syllabus-note">Each day is generated for your progress. Day 02+ starts with a recap.</p>
      </aside>
      <main className="lab-main">
        {error && <p className="learn-error" role="alert">{error}</p>}
        {active && active.lesson.id === lesson?.id ? <>
          <section className="lab-task-card">
            <div className="lab-task-meta">
              <span>Day {active.lesson.id.replace(/\D/g, '') || '1'}</span>
              <span>Task {active.stepIndex + 1} of {active.steps.length}</span>
              {active.step.recap && <span className="lab-recap">Recap</span>}
            </div>
            <h2>{active.lesson.title}</h2>
            {active.lesson.story && <p className="lab-scenario">{active.lesson.story}</p>}
            {!teaching.taught && active.step.teach
              ? <>
                <div className="lab-lesson"><strong>Learn first</strong><p><LessonText text={active.step.teach} /></p></div>
                <div className="lab-task-actions">
                  <button className="primary" onClick={teaching.ready}>I&apos;m ready — let me try</button>
                  <button className="quiet" onClick={() => void call('quit')}>Pause lab</button>
                </div>
              </>
              : <>
                <div className="lab-task-prompt"><strong>Your task</strong><span>{active.step.task}</span></div>
                <div className="lab-task-actions">
                  <button onClick={() => void terminal.current?.run('/hint')}>Hint</button>
                  <button onClick={() => void terminal.current?.run('/answer')}>Show answer</button>
                  {active.step.teach && <button className="link" onClick={teaching.review}>Review the lesson</button>}
                  <button className="quiet" onClick={() => void call('quit')}>Pause lab</button>
                </div>
              </>}
          </section>
          <div className="lab-workspace">
            <LabTerminal ref={terminal} system={system} variant={variant} courseId={courseId} />
            {variant === 'docker' && <DockerVisualization system={system} />}
            {variant === 'chmod' && <PermissionVisualization task={active.step.task} />}
          </div>
        </> : <LessonIntro title={lesson?.title ?? 'Choose a lab day'} done={lesson?.completed === lesson?.steps}
          onStart={() => lesson && void call('start', { lesson: lesson.id })} summary={status.course.summary} />}
      </main>
    </div>
  </div>;
}

/** Lesson text with `code` in backticks shown as code. */
function LessonText({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, index) => part.startsWith('`') && part.endsWith('`') && part.length > 2
    ? <code key={index}>{part.slice(1, -1)}</code>
    : <span key={index}>{part}</span>)}</>;
}

/**
 * Teach first, then test: each task starts with its lesson, and the task appears once the learner says they're
 * ready. Which lessons they have read is remembered in this browser.
 */
function useTaught(courseId: string, stepId: string | undefined) {
  const key = `tuxos.taught.${courseId}`;
  const read = (): string[] => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]; } catch { return []; }
  };
  const [taught, setTaught] = useState<string[]>(read);
  const done = stepId ? taught.includes(stepId) : true;
  const mark = (value: boolean) => {
    if (!stepId) return;
    const next = value ? [...new Set([...taught, stepId])] : taught.filter((id) => id !== stepId);
    setTaught(next);
    try { localStorage.setItem(key, JSON.stringify(next.slice(-200))); } catch { /* remembering is optional */ }
  };
  return { taught: done, ready: () => mark(true), review: () => mark(false) };
}

/** Tasks done across the whole course, as a number and a bar. */
function LabProgress({ lessons }: { lessons: { steps: number; completed: number }[] }) {
  const done = lessons.reduce((total, item) => total + item.completed, 0);
  const total = lessons.reduce((sum, item) => sum + item.steps, 0);
  return <div className="lab-progress" aria-label={`Course progress: ${done} of ${total} tasks`}>
    <span><strong>{done}</strong> / {total} tasks</span>
    <span className="lab-progress-bar"><i style={{ width: total ? `${(done / total) * 100}%` : 0 }} /></span>
  </div>;
}

function LinuxTerminalLab({ system, courseId }: { system: SystemClient; courseId: string }) {
  const { status, error, call } = useLessonStatus(system, courseId);
  const [retrying, setRetrying] = useState(false);
  const active = status?.active;
  const task = active?.step;
  const teaching = useTaught(courseId, task?.id);
  const lessonRead = teaching.taught;
  if (!status) return <div className="linux-terminal-loading">{error || 'Connecting to Linux trainer…'}</div>;
  // While the first lab is being designed, say so: it is not an error, and the status polls until it is ready.
  if ((!status.lessons.length || !task) && status.lastExplain?.includes('generating')) {
    return <div className="linux-terminal-unavailable" role="status">
      <div className="linux-terminal-unavailable-bar">linux-trainer.service</div>
      <pre>{`# Starting the AI trainer…\n# ${status.lastExplain}`}<span className="linux-terminal-cursor" /></pre>
    </div>;
  }
  if (!status.lessons.length || !task) return <div className="linux-terminal-unavailable">
    <div className="linux-terminal-unavailable-bar">linux-trainer.service</div>
    <pre>{`# AI trainer unavailable\n# No local question is loaded.\n# ${status.lastExplain ?? error ?? 'Check the learning API and retry.'}`}</pre>
    <button disabled={retrying} onClick={() => {
      setRetrying(true);
      void call('retry').finally(() => setRetrying(false));
    }}>{retrying ? 'Waiting for AI trainer…' : 'Retry AI trainer'}</button>
  </div>;
  const lesson = status.lessons.find((each) => each.id === active!.lesson.id);
  const terminalId = `${courseId}-lab`;
  // The hint and answer buttons type the same slash commands a learner can type themselves.
  const type = (command: string) => window.dispatchEvent(new CustomEvent('tuxos:terminal-type', {
    detail: { windowId: terminalId, data: `${command}\r`, accepted: false },
  }));
  return <div className="linux-terminal-lab">
    <header className="linux-mission" aria-label="Current Linux mission">
      <div className="linux-mission-top">
        <span className="linux-mission-day">{active!.lesson.title}</span>
        <span className={`linux-mission-kind ${task.recap ? 'is-recap' : 'is-new'}`}>{task.recap ? 'Recap' : 'New skill'}</span>
        <span className="linux-mission-count">Task {active!.stepIndex + 1} of {active!.steps.length}</span>
        <span className="linux-mission-dots" aria-hidden="true">
          {active!.steps.map((step, index) => <i
            key={step.id}
            className={step.done ? 'done' : index === active!.stepIndex ? 'current' : ''}
          />)}
        </span>
        {lesson && <span className="linux-mission-course" title="Tasks completed in this day">
          {lesson.completed}/{lesson.steps} done
        </span>}
      </div>
      {active!.lesson.story && <p className="linux-mission-scenario">{active!.lesson.story}</p>}
      {!lessonRead && task.teach
        ? <>
          <div className="linux-mission-learn">
            <span className="linux-mission-label">Learn first</span>
            <p><LessonText text={task.teach} /></p>
          </div>
          <div className="linux-mission-actions">
            <span className="linux-mission-help">Read this, then try it yourself in the terminal below.</span>
            <button type="button" className="primary" onClick={teaching.ready}>I&apos;m ready — let me try</button>
          </div>
        </>
        : <>
          <div className="linux-mission-task">
            <span className="linux-mission-label">Your task</span>
            <p>{task.task}</p>
          </div>
          <div className="linux-mission-actions">
            <span className="linux-mission-help">Type one command in the terminal below and press <kbd>Enter</kbd> to check it.</span>
            {task.teach && <button type="button" className="quiet" onClick={teaching.review}>Review the lesson</button>}
            <button type="button" onClick={() => type('/hint')}>Hint</button>
            <button type="button" onClick={() => type('/answer')}>Show answer</button>
          </div>
        </>}
    </header>
    <TerminalSurface system={system} learningModule={courseId} inputId={terminalId} />
  </div>;
}

interface LabTerminalHandle { run(command: string): Promise<void>; }

export const LabTerminal = forwardRef<LabTerminalHandle, { system: SystemClient; variant: LabVariant; courseId: string }>(function LabTerminal({ system, variant, courseId }, ref) {
  const [session, setSession] = useState<TerminalSession>();
  const [prompt, setPrompt] = useState('$');
  const [line, setLine] = useState('');
  const [entries, setEntries] = useState<{ command?: string; result?: TerminalResult }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let disposed = false;
    void system.createTerminal({ learningModule: courseId }).then(async (created) => {
      if (disposed) return;
      setSession(created);
      setPrompt(await created.prompt());
    });
    return () => { disposed = true; };
  }, [system, courseId]);

  const run = async (command: string) => {
    if (!session || !command.trim()) return;
    setLine('');
    const result = await session.run(command);
    setEntries((previous) => [...previous, { command, result }].slice(-80));
    setPrompt(await session.prompt());
    input.current?.focus();
  };
  useImperativeHandle(ref, () => ({ run: async (command) => {
    if (!session) return;
    const result = await session.run(command);
    setEntries((previous) => [...previous, { command, result }].slice(-80));
    setPrompt(await session.prompt());
    input.current?.focus();
  } }), [session]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!line.trim()) return;
    await run(line);
  }

  return <section className="lab-terminal" aria-label={`${variant} terminal`}>
    <div className="lab-terminal-bar"><span className="terminal-led" /> <strong>terminal</strong><span>ENTER to run · /hint · /answer</span></div>
    <div className="lab-terminal-output" onClick={() => input.current?.focus()}>
      <div className="lab-terminal-welcome">{variant === 'docker' ? 'Docker sandbox ready. Work the incident from the shell.' : variant === 'chmod' ? 'Permission sandbox ready. Verify every change with evidence.' : 'Linux sandbox ready. Complete the task with observable terminal evidence.'}</div>
      {entries.map((entry, index) => <div key={`${entry.command}-${index}`} className="lab-terminal-entry">
        <div><span className="lab-prompt">{prompt}</span> {entry.command}</div>
        {entry.result && <pre className={entry.result.code ? 'terminal-failure' : ''}>{entry.result.stdout}{entry.result.stderr}</pre>}
        {entry.result?.feedback && <div className={`lab-feedback ${entry.result.feedback.correct ? 'correct' : 'wrong'}`} role="status">
          <strong>{entry.result.feedback.correct ? '✓ Correct!' : '✗ Not quite'}</strong>
          <span>{entry.result.feedback.text}</span>
          <small>{entry.result.feedback.correct ? 'Your next task is ready above.' : 'Try again, or press Hint for a nudge.'}</small>
        </div>}
      </div>)}
      <form onSubmit={submit} className="lab-terminal-form">
        <span className="lab-prompt">{prompt}</span>
        <input ref={input} value={line} onChange={(event) => setLine(event.target.value)} disabled={!session} aria-label="Terminal command" autoComplete="off" spellCheck={false} />
      </form>
    </div>
  </section>;
});

function DockerVisualization({ system }: { system: SystemClient }) {
  const [state, setState] = useState<{ images: string[]; containers: { name: string; image: string; ports: { host: number; container: number }[]; stopped: number | null }[] }>({ images: [], containers: [] });
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const result = await system.dispatch<typeof state>('learn-docker.snapshot', {});
      if (!disposed && result.ok) setState(result.value);
    };
    void refresh();
    return system.onChange(() => void refresh());
  }, [system]);
  return <aside className="lab-visual docker-visual" aria-label="Docker engine visualization">
    <div className="lab-section-label">Engine state</div>
    <div className="docker-daemon"><span className="docker-orb" /> docker daemon <span className="docker-live">LIVE</span></div>
    <div className="visual-group"><span>Images</span><strong>{state.images.length}</strong></div>
    {state.images.length ? <div className="visual-chips">{state.images.map((image) => <code key={image}>{image}:latest</code>)}</div> : <p className="visual-empty">No images pulled yet.</p>}
    <div className="visual-group"><span>Containers</span><strong>{state.containers.length}</strong></div>
    <div className="container-stack">{state.containers.map((container) => <div className="container-card" key={container.name}>
      <span className={`container-dot ${container.stopped === null ? 'running' : ''}`} />
      <div><strong>{container.name}</strong><small>{container.image}{container.ports.length ? ` · :${container.ports[0]!.host}` : ''}</small></div>
    </div>)}</div>
  </aside>;
}

function PermissionVisualization({ task }: { task: string }) {
  const bits = /\b([0-7]{3})\b/.exec(task)?.[1] ?? '---';
  const rows = ['owner', 'group', 'others'];
  return <aside className="lab-visual permission-visual" aria-label="Permission visualization">
    <div className="lab-section-label">Permission model</div>
    <p>Translate the task into evidence with <code>ls -l</code>.</p>
    <div className="permission-grid">{rows.map((row, index) => <div key={row}><span>{row}</span><strong>{bits[index] ?? '-'}</strong><small>{bits[index] === '7' ? 'rwx' : bits[index] === '6' ? 'rw-' : bits[index] === '5' ? 'r-x' : bits[index] === '4' ? 'r--' : '---'}</small></div>)}</div>
    <code className="permission-command">chmod {bits} file</code>
  </aside>;
}

function LessonIntro({ title, done, summary, onStart }: {
  title: string;
  done: boolean;
  summary: string;
  onStart(): void;
}) {
  return <div className="learn-intro">
    <h1>{title}</h1>
    <p>{summary}</p>
    <p>Each step checks your work automatically as you go: just do it in the terminal or the desktop.</p>
    <button className="primary" onClick={onStart}>{done ? 'Do it again' : 'Start lesson'}</button>
  </div>;
}

/** A course module's status, refreshed whenever the system changes (progress is saved to a file). */
export function useLessonStatus(system: SystemClient, courseId: string) {
  const [status, setStatus] = useState<LessonStatus | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const result = await system.dispatch<LessonStatus>(`${courseId}.status`, {});
    if (result.ok) {
      setStatus(result.value);
      setError('');
    }
    else setError(result.error.message);
  }, [system, courseId]);

  const call = useCallback(async (action: string, payload: unknown = {}) => {
    const result = await system.dispatch(`${courseId}.${action}`, payload);
    if (!result.ok) setError(result.error.message);
    await refresh();
  }, [system, courseId, refresh]);

  useEffect(() => {
    void refresh();
    return system.onChange(() => void refresh());
  }, [system, refresh]);

  // Syllabus generation completes outside the kernel event stream, so poll only while the
  // initial status is pending; otherwise a failed plan could leave the UI stuck on "generating".
  useEffect(() => {
    if (!status?.lastExplain?.includes('generating')) return;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [status?.lastExplain, refresh]);

  return { status, error, call };
}
