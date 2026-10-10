import type { KernelEvent } from '@ayalvasis/sdk';
import { describe, expect, it } from 'vitest';
import { satisfied, type CheckContext, type Entry } from './conditions';
import { LessonRunner, type LessonHost } from './runner';
import type { Course, Progress } from './types';
import { validateCourse } from './validate';

let seq = 0;
function ran(line: string, extra: Partial<{ cwd: string; code: number; stdout: string; stderr: string }> = {}) {
  const commands = line.split(/[|;&]+/).map((part) => part.trim().split(/\s+/)[0]!).filter(Boolean);
  return event('shell.ran', { line, cwd: '/home/ada', code: 0, stdout: '', stderr: '', commands, ...extra });
}
function event(type: string, payload: unknown, ok = true): KernelEvent {
  return { seq: ++seq, time: 0, actor: { kind: 'user', id: 'ada' }, user: 'ada', action: { type, payload }, ok,
    mutates: false };
}

function context(events: KernelEvent[], files: Record<string, Entry> = {}): CheckContext {
  return { events, home: '/home/ada', read: (path) => files[path] };
}

describe('conditions', () => {
  it('matches commands that ran, by name, line, exit code and output', () => {
    const ctx = context([ran('grep -c ERROR log', { stdout: '3\n' })]);
    expect(satisfied({ ran: { command: 'grep', line: '-c', stdout: '^3$' } }, ctx)).toBe(true);
    expect(satisfied({ ran: { command: 'grep', code: 1 } }, ctx)).toBe(false);
    expect(satisfied({ ran: { command: 'sort' } }, ctx)).toBe(false);
  });

  it('only counts what the learner did, not the tutor', () => {
    const tutorRan = { ...ran('ls'), actor: { kind: 'tutor' as const, id: 'tutor' } };
    expect(satisfied({ ran: { command: 'ls' } }, context([tutorRan]))).toBe(false);
  });

  it('ignores failed dispatches', () => {
    expect(satisfied({ ran: { command: 'ls' } }, context([{ ...ran('ls'), ok: false }]))).toBe(false);
  });

  it('checks the latest working directory, with ~ for home', () => {
    const ctx = context([ran('cd /tmp', { cwd: '/tmp' }), ran('cd', { cwd: '/home/ada' })]);
    expect(satisfied({ cwd: '~' }, ctx)).toBe(true);
    expect(satisfied({ cwd: '/tmp' }, ctx)).toBe(false);
  });

  it('checks files: existence, kind, contents and mode', () => {
    const files = {
      '/home/ada/notes': { kind: 'file' as const, mode: 0o600, content: 'learn linux\n' },
      '/home/ada/dir': { kind: 'dir' as const, mode: 0o755 },
    };
    const ctx = context([], files);
    expect(satisfied({ exists: '~/notes', kind: 'file' }, ctx)).toBe(true);
    expect(satisfied({ exists: '~/notes', kind: 'dir' }, ctx)).toBe(false);
    expect(satisfied({ missing: '~/gone' }, ctx)).toBe(true);
    expect(satisfied({ contains: { path: '~/notes', pattern: '^learn' } }, ctx)).toBe(true);
    expect(satisfied({ mode: { path: '~/notes', is: '600' } }, ctx)).toBe(true);
    expect(satisfied({ mode: { path: '~/dir', is: '700' } }, ctx)).toBe(false);
  });

  it('combines checks with all, any and not', () => {
    const ctx = context([event('session.open', { appId: 'files' })]);
    expect(satisfied({ all: [{ opened: 'files' }, { not: { opened: 'terminal' } }] }, ctx)).toBe(true);
    expect(satisfied({ any: [{ opened: 'terminal' }, { missing: '~/x' }] }, ctx)).toBe(true);
  });
});

describe('validateCourse', () => {
  it('reports every problem with where it is', () => {
    const bad = {
      id: 'Bad Id', title: '', summary: '', lessons: [{
        id: 'one', title: 'One', story: 'Story', solution: [],
        steps: [
          { id: 's', task: 'Do it', hints: [], check: { ran: { line: '(' } } },
          { id: 's', task: '', hints: ['h'], check: { mode: { path: '~/x', is: '9' } } },
        ],
      }],
    } as unknown as Course;
    expect(validateCourse(bad)).toEqual([
      'course: invalid id "Bad Id"',
      'Bad Id: missing title',
      'Bad Id/one: has no solution to replay',
      'Bad Id/one/s: needs at least one hint',
      'Bad Id/one/s: invalid pattern "("',
      'Bad Id/one/s: duplicate step id',
      'Bad Id/one/s: missing task',
      'Bad Id/one/s: bad mode 9',
    ]);
  });
});

const course: Course = {
  id: 'demo', title: 'Demo', summary: 'A demo', lessons: [{
    id: 'basics', title: 'Basics', story: 'Story', solution: ['ls', 'mkdir x'],
    setup: { dirs: ['~/play'], files: { '~/play/hello.txt': 'hi' } },
    steps: [
      { id: 'ls', task: 'Run ls', hints: ['Type ls'], check: { ran: { command: 'ls' } }, explain: 'Nice.' },
      { id: 'mkdir', task: 'Make x', hints: ['mkdir x'], check: { exists: '~/x', kind: 'dir' } },
    ],
  }],
};

function fakeHost(saved?: Progress) {
  const files: Record<string, Entry> = {};
  const listeners = new Set<(event: KernelEvent) => void>();
  let progress = saved;
  const host: LessonHost = {
    home: '/home/ada',
    onEvent: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    read: (path) => files[path],
    mkdir: (path) => { files[path] = { kind: 'dir', mode: 0o755 }; },
    write: (path, content) => { files[path] = { kind: 'file', mode: 0o644, content }; },
    load: () => progress,
    save: (next) => { progress = structuredClone(next); },
  };
  return { host, files, emit: (event: KernelEvent) => listeners.forEach((listener) => listener(event)),
    saved: () => progress, listeners };
}

describe('LessonRunner', () => {
  it('sets up the lesson, advances on events, and finishes it', () => {
    const { host, files, emit } = fakeHost();
    const runner = new LessonRunner(course, host);
    const seen: string[] = [];
    runner.on((event) => seen.push(event.type));
    runner.start('basics');
    expect(files['/home/ada/play/hello.txt']).toMatchObject({ content: 'hi' });
    expect(runner.status().active?.step.id).toBe('ls');

    emit(ran('ls'));
    expect(runner.status()).toMatchObject({ active: { step: { id: 'mkdir' } }, lastExplain: 'Nice.' });
    files['/home/ada/x'] = { kind: 'dir', mode: 0o755 };
    emit(event('fs.mkdir', { path: '/home/ada/x' }));
    expect(runner.status().active).toBeNull();
    expect(runner.status().lessons[0]).toMatchObject({ completed: 2, steps: 2 });
    expect(seen).toEqual(['step-done', 'step-done', 'lesson-done']);
  });

  it('completes a step at once if the system already satisfies it', () => {
    const { host, files, emit } = fakeHost();
    files['/home/ada/x'] = { kind: 'dir', mode: 0o755 };
    const runner = new LessonRunner(course, host);
    runner.start('basics');
    emit(ran('ls'));
    expect(runner.status().active).toBeNull();
  });

  it('does not let an event count for a later step', () => {
    const { host, emit } = fakeHost();
    const twoLs: Course = { ...course, lessons: [{ ...course.lessons[0]!, steps: [
      { id: 'one', task: 'ls', hints: ['h'], check: { ran: { command: 'ls' } } },
      { id: 'two', task: 'ls again', hints: ['h'], check: { ran: { command: 'ls' } } },
    ] }] };
    const runner = new LessonRunner(twoLs, host);
    runner.start('basics');
    emit(ran('ls'));
    expect(runner.status().active?.step.id).toBe('two');
  });

  it('saves progress and resumes from it', () => {
    const first = fakeHost();
    const runner = new LessonRunner(course, first.host);
    runner.start('basics');
    first.emit(ran('ls'));
    const resumed = new LessonRunner(course, fakeHost(first.saved()).host);
    expect(resumed.status().active?.step.id).toBe('mkdir');
  });

  it('quits, resets and stops listening when disposed', () => {
    const { host, listeners } = fakeHost();
    const runner = new LessonRunner(course, host);
    runner.start('basics');
    runner.quit();
    expect(runner.status().active).toBeNull();
    runner.reset();
    expect(runner.status().lessons[0]?.completed).toBe(0);
    runner.dispose();
    expect(listeners.size).toBe(0);
    expect(() => runner.start('nope')).toThrow('no such lesson');
  });
});
