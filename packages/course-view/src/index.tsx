import type { LessonStatus } from '@tuxos/lessons';
import type { SystemClient } from '@tuxos/system';
import { useCallback, useEffect, useState } from 'react';
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
    if (result.ok) setStatus(result.value);
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

  return { status, error, call };
}
