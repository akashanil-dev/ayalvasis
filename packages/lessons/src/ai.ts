import { KernelError } from '@tuxos/kernel';
import type { KernelEvent, ModuleContext } from '@tuxos/sdk';
import type { Course, Lesson, SolutionStep } from './types';
import { expand } from './conditions';
import type { LessonHost, LessonStatus } from './runner';

export interface TrainerProfile {
  id: string;
  title: string;
  specialty: string;
  level: string;
  scenarioFocus: string;
}

export interface AITask {
  id: string;
  title: string;
  scenario: string;
  task: string;
  objective: string;
  hints: string[];
  answer: string;
  explain: string;
}

export interface AISyllabus {
  courseId: string;
  title: string;
  summary: string;
  trainer: TrainerProfile;
  days: { day: number; title: string; recap: boolean; tasks: AITask[] }[];
}

interface AIProgress {
  syllabus: AISyllabus;
  completed: string[];
  active: { day: number; task: number } | null;
  lastFeedback: string | null;
  lastResult: 'correct' | 'wrong' | null;
}

export interface LearningMemoryEntry {
  id: string;
  kind: 'plan' | 'attempt' | 'hint' | 'answer' | 'feedback';
  taskId?: string;
  summary: string;
  correct?: boolean;
  at: number;
}

export interface LearningMemory {
  moduleId: string;
  entries: LearningMemoryEntry[];
}

interface ShellRun {
  line: string;
  code: number;
  stdout: string;
  stderr: string;
  commands: string[];
}

const STATE_DIR = '~/.local/share/tuxos/ai-learning';
const MEMORY_DIR = '~/.local/share/tuxos/ai-learning/memory';
const MAX_MEMORY_ENTRIES = 50;
const MAX_MEMORY_SUMMARY = 1_200;

/** A server-designed course that still uses local shell execution as the evidence source. */
export class AICourseRunner {
  private state: AIProgress | undefined;
  private readonly memory: LearningMemory;
  private fallbackMode = false;
  private evaluating = false;
  private pendingAssessment: Promise<string> | undefined;
  private disposed = false;
  private readonly stop: () => void;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly course: Course,
    private readonly profile: TrainerProfile,
    private readonly host: LessonHost,
  ) {
    this.state = this.load();
    this.memory = this.loadMemory();
    this.fallbackMode = !!this.state && this.state.syllabus.days.length === this.course.lessons.length
      && this.state.syllabus.days.every((day, index) => day.tasks[0]?.id === this.course.lessons[index]?.steps[0]?.id);
    if (this.state?.active) learningRuntime.current = this;
    this.stop = ctx.onEvent((event) => this.observe(event));
  }

  async bootstrap(): Promise<void> {
    if (this.state) return;
    try {
      if (!this.ctx.learning) throw new Error('AI learning service is not configured');
      const result = await this.ctx.learning.request('/plan', {
        module: this.ctx.id,
        trainer: this.profile,
        memory: this.memory,
        fallback: { title: this.course.title, summary: this.course.summary, lessons: this.course.lessons.map((l) => l.title) },
      }) as AISyllabus;
      validateSyllabus(result, this.ctx.id);
      this.state = { syllabus: result, completed: [], active: { day: result.days[0]!.day, task: 0 }, lastFeedback: null, lastResult: null };
      this.remember({ kind: 'plan', summary: `Generated ${result.days.length}-day syllabus: ${result.title}` });
      learningRuntime.current = this;
      this.save();
    } catch (error) {
      // A learner should still have a working course without network access or an API key.
      this.ctx.log(`AI syllabus unavailable; using reviewed fallback: ${error instanceof Error ? error.message : String(error)}`);
      this.state = fallbackProgress(this.course, this.profile, this.ctx.id);
      this.fallbackMode = true;
      this.state.active = { day: 1, task: 0 };
      this.remember({ kind: 'plan', summary: 'Used the reviewed local fallback syllabus because AI planning was unavailable.' });
      learningRuntime.current = this;
      this.save();
    }
  }

  dispose(): void { this.disposed = true; this.stop(); }

  status(): LessonStatus {
    const state = this.requireState();
    const activeTask = this.currentTask();
    const days = state.syllabus.days.map((day) => ({
      id: this.fallbackMode ? this.course.lessons[day.day - 1]?.id ?? `day-${day.day}` : `day-${day.day}`,
      title: `Day ${day.day}: ${day.title}`,
      steps: day.tasks.length,
      completed: day.tasks.filter((task) => state.completed.includes(task.id)).length,
    }));
    return {
      course: { id: state.syllabus.courseId, title: state.syllabus.title, summary: state.syllabus.summary },
      lessons: days,
      active: activeTask && state.active ? {
        lesson: {
          id: this.fallbackMode ? this.course.lessons[state.active.day - 1]?.id ?? `day-${state.active.day}` : `day-${state.active.day}`,
          title: this.fallbackMode ? this.course.lessons[state.active.day - 1]?.title ?? this.day(state.active.day).title : `Day ${state.active.day}: ${this.day(state.active.day).title}`,
          story: activeTask.scenario,
        },
        stepIndex: state.active.task,
        steps: this.day(state.active.day).tasks.map((task) => ({
          id: task.id, task: `${task.title}: ${task.task}`, done: state.completed.includes(task.id),
        })),
        step: { id: activeTask.id, task: `${activeTask.title}: ${activeTask.task}`, hints: activeTask.hints },
      } : null,
      lastExplain: state.lastFeedback,
    };
  }

  start(dayId: string): void {
    const state = this.requireState();
    let day = Number.parseInt(dayId.replace(/^day-/, ''), 10);
    let selected = state.syllabus.days.find((item) => item.day === day);
    if (!selected && this.fallbackMode) {
      const lessonIndex = this.course.lessons.findIndex((lesson) => lesson.id === dayId);
      if (lessonIndex >= 0) {
        day = lessonIndex + 1;
        selected = state.syllabus.days.find((item) => item.day === day);
      }
    }
    if (!selected) throw new Error(`no such lesson: ${dayId}`);
    if (this.fallbackMode) {
      const lesson = this.course.lessons[day - 1];
      for (const dir of lesson?.setup?.dirs ?? []) this.host.mkdir(expand(dir, this.host.home));
      for (const [path, content] of Object.entries(lesson?.setup?.files ?? {})) this.host.write(expand(path, this.host.home), content);
    }
    const task = selected.tasks.findIndex((item) => !state.completed.includes(item.id));
    state.active = { day, task: Math.max(task, 0) };
    state.lastFeedback = null;
    state.lastResult = null;
    learningRuntime.current = this;
    this.save();
  }

  next(): string {
    const state = this.requireState();
    const current = this.currentTask();
    if (!current) return 'All generated tasks are complete. Ask for a new syllabus day when ready.';
    return `${current.title}\n${current.scenario}\nYour task: ${current.task}`;
  }

  async hint(): Promise<string> { return this.askFor('hint'); }
  async answer(): Promise<string> { return this.askFor('answer'); }
  async waitForAssessment(): Promise<string | undefined> {
    const pending = this.pendingAssessment;
    if (!pending) return undefined;
    this.pendingAssessment = undefined;
    return pending;
  }
  quit(): void { if (this.state) { this.state.active = null; this.save(); } }
  reset(): void {
    if (!this.state) return;
    this.state.completed = [];
    this.state.active = null;
    this.state.lastFeedback = null;
    this.state.lastResult = null;
    this.save();
  }

  private async askFor(kind: 'hint' | 'answer'): Promise<string> {
    const task = this.currentTask();
    if (!task) return 'There is no active task. Start a day with the course action first.';
    if (!this.ctx.learning) {
      const text = kind === 'hint' ? task.hints[0] ?? 'Read the task carefully and inspect the system.' : task.answer;
      this.remember({ kind, taskId: task.id, summary: text });
      return text;
    }
    try {
      const result = await this.ctx.learning.request(`/${kind}`, { module: this.ctx.id, trainer: this.profile, task, memory: this.memory });
      const text = (result as { text?: string }).text ?? (kind === 'hint' ? task.hints[0] ?? 'Inspect the task and try one small command.' : task.answer);
      this.remember({ kind, taskId: task.id, summary: text });
      return text;
    } catch {
      const text = kind === 'hint' ? task.hints[0] ?? 'Break the task into one small command.' : task.answer;
      this.remember({ kind, taskId: task.id, summary: text });
      return text;
    }
  }

  private observe(event: KernelEvent): void {
    if (this.disposed || this.evaluating || !this.state?.active) return;
    if (!event.ok || event.actor.kind !== 'user') return;
    if (event.action.type !== 'shell.ran' && event.action.type !== 'session.open') return;
    const run = event.action.type === 'shell.ran' ? event.action.payload as ShellRun : { line: '', code: 0, stdout: '', stderr: '', commands: [] };
    if (/^\s*\/(hint|answer|task|next)(?:\s|$)/.test(run.line)) return;
    const task = this.currentTask();
    if (!task) return;
    if (this.fallbackMode) {
      this.evaluateFallback(task, event, run);
      return;
    }
    this.evaluating = true;
    this.pendingAssessment = this.evaluate(task, run).finally(() => { this.evaluating = false; });
  }

  private evaluateFallback(task: AITask, event: KernelEvent, run: ShellRun): void {
    const expected = task.answer.trim();
    const correct = event.action.type === 'session.open'
      ? expected.startsWith('Open ')
      : run.line.trim() === expected;
    const state = this.requireState();
    state.lastResult = correct ? 'correct' : 'wrong';
    state.lastFeedback = correct ? task.explain : 'Not yet. Read the task and compare your command with the expected evidence.';
    this.remember({ kind: 'attempt', taskId: task.id, summary: `${run.line || 'session opened'} — ${state.lastFeedback}`, correct });
    if (correct) this.advanceTask(state, task);
    this.save();
  }

  private async evaluate(task: AITask, run: ShellRun): Promise<string> {
    let result: { correct?: boolean; feedback?: string; next?: string } = {};
    try {
      if (!this.ctx.learning) throw new Error('AI learning service is not configured');
      result = await this.ctx.learning.request('/evaluate', {
        module: this.ctx.id, trainer: this.profile, task, command: run, memory: this.memory,
      }) as typeof result;
    } catch {
      // Without the service, fall back to a conservative command-name check and teach rather than auto-pass.
      result = { correct: task.answer.trim().split(/\s+/)[0] === run.commands[0], feedback: 'Check the command, its arguments, and the command output.' };
    }
    const state = this.requireState();
    state.lastResult = result.correct ? 'correct' : 'wrong';
    state.lastFeedback = result.feedback ?? (result.correct ? 'Correct. Explain what you changed before moving on.' : 'Not yet. Read the task and inspect the command output.');
    this.remember({ kind: 'attempt', taskId: task.id, summary: `${run.line} — ${state.lastFeedback}`, correct: !!result.correct });
    this.remember({ kind: 'feedback', taskId: task.id, summary: state.lastFeedback, correct: !!result.correct });
    if (result.correct) this.advanceTask(state, task);
    this.save();
    return `${result.correct ? '✓ Correct' : '✗ Not yet'} — ${state.lastFeedback}`;
  }

  private advanceTask(state: AIProgress, task: AITask): void {
    if (!state.active) return;
    if (!state.completed.includes(task.id)) state.completed.push(task.id);
    const day = this.day(state.active.day);
    const nextIndex = state.active.task + 1;
    if (nextIndex < day.tasks.length) state.active.task = nextIndex;
    else if (this.fallbackMode) {
      state.active = null;
    } else {
      const nextDay = state.syllabus.days.find((candidate) => candidate.day > state.active!.day && candidate.tasks.some((item) => !state.completed.includes(item.id)));
      state.active = nextDay ? { day: nextDay.day, task: nextDay.tasks.findIndex((item) => !state.completed.includes(item.id)) } : null;
    }
  }

  private currentTask(): AITask | undefined {
    const active = this.state?.active;
    return active ? this.day(active.day).tasks[active.task] : undefined;
  }

  private day(day: number) { return this.requireState().syllabus.days.find((item) => item.day === day)!; }
  private requireState(): AIProgress { if (!this.state) throw new Error('learning syllabus is still loading'); return this.state; }

  private load(): AIProgress | undefined {
    const saved = this.host.read(`${expand(STATE_DIR, this.host.home)}/${this.ctx.id}.json`);
    if (!saved?.content) return undefined;
    try { const value = JSON.parse(saved.content) as AIProgress; validateSyllabus(value.syllabus, this.ctx.id); return value; } catch { return undefined; }
  }

  private loadMemory(): LearningMemory {
    const saved = this.host.read(`${expand(MEMORY_DIR, this.host.home)}/${this.ctx.id}.json`);
    if (!saved?.content) return { moduleId: this.ctx.id, entries: [] };
    try {
      const value = JSON.parse(saved.content) as LearningMemory;
      if (value.moduleId !== this.ctx.id || !Array.isArray(value.entries)) throw new Error('invalid memory');
      return { moduleId: this.ctx.id, entries: value.entries.slice(-MAX_MEMORY_ENTRIES) };
    } catch {
      return { moduleId: this.ctx.id, entries: [] };
    }
  }

  private remember(entry: Omit<LearningMemoryEntry, 'id' | 'at'>): void {
    this.memory.entries.push({ ...entry, id: `${Date.now()}-${this.memory.entries.length}`, at: Date.now(), summary: entry.summary.slice(0, MAX_MEMORY_SUMMARY) });
    this.memory.entries = this.memory.entries.slice(-MAX_MEMORY_ENTRIES);
    this.host.mkdir(expand(MEMORY_DIR, this.host.home));
    this.host.write(`${expand(MEMORY_DIR, this.host.home)}/${this.ctx.id}.json`, `${JSON.stringify(this.memory, null, 2)}\n`);
  }

  private save(): void {
    const state = this.requireState();
    this.host.mkdir(expand(STATE_DIR, this.host.home));
    this.host.write(`${expand(STATE_DIR, this.host.home)}/${this.ctx.id}.json`, `${JSON.stringify(state, null, 2)}\n`);
    if (this.fallbackMode) {
      const completed: Record<string, string[]> = {};
      for (const lesson of this.course.lessons) {
        completed[lesson.id] = lesson.steps.map((step) => step.id).filter((id) => state.completed.includes(id));
      }
      const active = state.active
        ? { lesson: this.course.lessons[state.active.day - 1]!.id, step: state.active.task }
        : null;
      this.host.write(`${this.host.home}/.local/share/tuxos/${this.ctx.id}.json`, `${JSON.stringify({ completed, active }, null, 2)}\n`);
    }
  }
}

export const learningRuntime: { current?: AICourseRunner } = {};

export async function activateAICourse(ctx: ModuleContext, course: Course, profile: TrainerProfile): Promise<() => void> {
  const runner = new AICourseRunner(ctx, course, profile, moduleLessonHost(ctx, course.id));
  await runner.bootstrap();
  registerAIActions(ctx, runner);
  return () => { if (learningRuntime.current === runner) learningRuntime.current = undefined; runner.dispose(); };
}

function registerAIActions(ctx: ModuleContext, runner: AICourseRunner): void {
  ctx.registerAction({ type: `${ctx.id}.status`, capability: 'lessons:read', mutates: false, description: 'Show the AI-designed syllabus and current terminal task.', run: () => runner.status() });
  ctx.registerAction({
    type: `${ctx.id}.start`, capability: 'lessons:write', mutates: false, description: 'Start an AI-designed learning day.',
    params: { type: 'object', properties: { lesson: { type: 'string' } }, required: ['lesson'] },
    run: (_action, payload) => {
      const lesson = (payload as { lesson?: unknown })?.lesson;
      if (typeof lesson !== 'string') throw new KernelError('EINVAL', 'lesson must be a string');
      try { runner.start(lesson); } catch (error) {
        if (error instanceof KernelError) throw error;
        throw new KernelError('ENOENT', error instanceof Error ? error.message : String(error));
      }
      return runner.status();
    },
  });
  ctx.registerAction({ type: `${ctx.id}.quit`, capability: 'lessons:write', mutates: false, description: 'Leave the current AI learning task.', run: () => { runner.quit(); return runner.status(); } });
  ctx.registerAction({ type: `${ctx.id}.reset`, capability: 'lessons:write', mutates: false, description: 'Reset AI learning progress.', run: () => { runner.reset(); return runner.status(); } });
}

function fallbackProgress(course: Course, trainer: TrainerProfile, courseId: string): AIProgress {
  const tasks = course.lessons.map((lesson, lessonIndex) => ({
    day: lessonIndex + 1, title: lesson.title, recap: lessonIndex > 0,
    tasks: lesson.steps.map((step, index) => ({
      id: step.id, title: `Task ${index + 1}`, scenario: lesson.story, task: step.task,
      objective: step.explain ?? lesson.title, hints: step.hints, answer: solutionText(lesson, index), explain: step.explain ?? '',
    })),
  }));
  return { syllabus: { courseId, title: course.title, summary: course.summary, trainer, days: tasks }, completed: [], active: null, lastFeedback: null, lastResult: null };
}

function solutionText(lesson: Lesson, index: number): string {
  const solution = lesson.solution[index] as SolutionStep | undefined;
  return typeof solution === 'string' ? solution : solution ? `Open ${solution.open}` : 'Review the task and try again.';
}

function validateSyllabus(value: AISyllabus, courseId: string): void {
  if (!value || value.courseId !== courseId || !Array.isArray(value.days) || value.days.length < 1) throw new Error('invalid AI syllabus');
  for (const day of value.days) {
    if (!Number.isInteger(day.day) || !day.title || !Array.isArray(day.tasks) || !day.tasks.length || (day.day > 1 && day.recap !== true)) throw new Error('invalid AI syllabus day');
    for (const task of day.tasks) if (!task.id || !task.task || !task.scenario || !Array.isArray(task.hints) || !task.answer) throw new Error('invalid AI task');
  }
}

function moduleLessonHost(ctx: ModuleContext, courseId: string): LessonHost {
  const home = `/home/${ctx.user}`;
  const dataDir = `${home}/.local/share/tuxos`;
  const read = <R>(type: string, path: string) => ctx.dispatch<R>(type, { path });
  return {
    home,
    onEvent: (listener) => ctx.onEvent(listener),
    read(path) {
      const stat = read<{ kind: 'file' | 'dir'; mode: number }>('fs.stat', path);
      if (!stat.ok) return undefined;
      if (stat.value.kind === 'dir') return { kind: 'dir', mode: stat.value.mode };
      const content = read<string>('fs.read', path);
      return { kind: 'file', mode: stat.value.mode, content: content.ok ? content.value : undefined };
    },
    mkdir: (path) => { ctx.dispatch('fs.mkdir', { path, parents: true }); },
    write: (path, content) => { ctx.dispatch('fs.write', { path, content }); },
    load: () => undefined,
    save: () => { ctx.log(`AI course state is stored by ${courseId}`); },
  };
}
