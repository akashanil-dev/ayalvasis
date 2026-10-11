import { KernelError } from '@tuxos/kernel';
import type { KernelEvent, ModuleContext } from '@tuxos/sdk';
import type { Course, Lesson, SolutionStep } from './types';
import { expand } from './conditions';
import type { LessonHost, LessonStatus, SurveyQuestion } from './runner';

export interface TrainerProfile {
  id: string;
  title: string;
  specialty: string;
  level: string;
  scenarioFocus: string;
}

export interface AICourseOptions {
  /** When true, never expose the reviewed JSON course as a learner question. */
  requireAI?: boolean;
  /** Ask these before designing the syllabus, so it fits a beginner and an experienced learner alike. */
  survey?: SurveyQuestion[];
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
  /** Taught before the learner tries: the concept and the command they will need, with an example. */
  teach?: string;
  recap?: boolean;
}

/** The trainer's verdict on one attempt, shown under the command in the terminal. */
export interface TrainerFeedback {
  correct: boolean;
  text: string;
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
  generatedByAI?: boolean;
  completed: string[];
  active: { day: number; task: number } | null;
  lastFeedback: string | null;
  lastResult: 'correct' | 'wrong' | null;
  /** Wrong attempts per task ID, so the trainer only starts revealing the answer after real effort. */
  failures?: Record<string, number>;
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
const MAX_LINUX_ANSWER = 140;
/** Wrong attempts on one task before the trainer starts revealing its answer; until then it only nudges. */
export const REVEAL_AFTER_FAILURES = 5;

function surveyPath(courseId: string, home: string): string {
  return `${expand(STATE_DIR, home)}/${courseId}-survey.json`;
}

function progressPath(courseId: string, home: string): string {
  // Keep any previously generated multi-command Linux syllabus available as local legacy data.
  const filename = courseId === 'learn-linux' ? 'learn-linux-v2.json' : `${courseId}.json`;
  return `${expand(STATE_DIR, home)}/${filename}`;
}

/** A server-designed course that still uses local shell execution as the evidence source. */
export class AICourseRunner {
  private state: AIProgress | undefined;
  private readonly memory: LearningMemory;
  private fallbackMode = false;
  private evaluating = false;
  private pendingAssessment: Promise<TrainerFeedback> | undefined;
  private disposed = false;
  private readonly stop: () => void;
  private readonly requireAI: boolean;
  private aiUnavailable = false;
  private unavailableReason = '';
  private bootstrapPromise: Promise<void> | undefined;
  private planning = false;
  private readonly survey: SurveyQuestion[];
  private surveyAnswers: Record<string, number> | undefined;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly course: Course,
    private readonly profile: TrainerProfile,
    private readonly host: LessonHost,
    options: AICourseOptions = {},
  ) {
    this.requireAI = options.requireAI === true;
    this.survey = options.survey ?? [];
    this.surveyAnswers = this.loadSurvey();
    this.state = this.load();
    this.memory = this.loadMemory();
    this.fallbackMode = !!this.state && this.state.generatedByAI !== true && this.state.syllabus.days.length === this.course.lessons.length
      && this.state.syllabus.days.every((day, index) => day.tasks[0]?.id === this.course.lessons[index]?.steps[0]?.id);
    if (this.requireAI && this.fallbackMode) this.state = undefined;
    if (this.state?.active) learningRuntime.activate(this.ctx.id);
    this.stop = ctx.onEvent((event) => this.observe(event));
  }

  bootstrap(): Promise<void> {
    if (this.state || this.awaitingSurvey()) return Promise.resolve();
    if (this.bootstrapPromise) return this.bootstrapPromise;
    this.aiUnavailable = false;
    this.unavailableReason = '';
    this.planning = true;
    this.bootstrapPromise = this.generateSyllabus().finally(() => {
      this.planning = false;
      this.bootstrapPromise = undefined;
    });
    return this.bootstrapPromise;
  }

  private async generateSyllabus(): Promise<void> {
    try {
      if (!this.ctx.learning) throw new Error('AI learning service is not configured');
      const result = await this.ctx.learning.request('/plan', {
        module: this.ctx.id,
        trainer: this.profile,
        fallback: { title: this.course.title, summary: this.course.summary, lessons: this.course.lessons.map((l) => l.title) },
        ...(this.surveyAnswers ? { survey: this.survey.map((question) => ({ question: question.question, rating: this.surveyAnswers![question.id]! })) } : {}),
      }) as AISyllabus;
      validateSyllabus(result, this.ctx.id);
      this.state = { syllabus: result, generatedByAI: true, completed: [], active: { day: result.days[0]!.day, task: 0 }, lastFeedback: null, lastResult: null };
      this.remember({ kind: 'plan', summary: `Generated ${result.days.length}-day syllabus: ${result.title}` });
      learningRuntime.activate(this.ctx.id);
      this.save();
    } catch (error) {
      if (this.requireAI) {
        this.aiUnavailable = true;
        this.unavailableReason = error instanceof Error ? error.message : String(error);
        this.ctx.log(`AI syllabus unavailable; Linux has no local question fallback: ${this.unavailableReason}`);
        return;
      }
      // A learner should still have a working course without network access or an API key.
      this.ctx.log(`AI syllabus unavailable; using reviewed fallback: ${error instanceof Error ? error.message : String(error)}`);
      this.state = fallbackProgress(this.course, this.profile, this.ctx.id);
      this.fallbackMode = true;
      this.state.active = { day: 1, task: 0 };
      this.remember({ kind: 'plan', summary: 'Used the reviewed local fallback syllabus because AI planning was unavailable.' });
      learningRuntime.activate(this.ctx.id);
      this.save();
    }
  }

  dispose(): void { this.disposed = true; this.stop(); }

  /** A syllabus is designed only once the learner has told us about their experience. */
  private awaitingSurvey(): boolean {
    return !this.state && this.survey.length > 0 && !this.surveyAnswers;
  }

  /** Saves the learner's star ratings, then designs their syllabus in the background. */
  submitSurvey(answers: unknown): void {
    if (this.state) throw new Error('this course already has a syllabus');
    const ratings = answers as Record<string, unknown> | null;
    if (!ratings || typeof ratings !== 'object') throw new Error('answers must be an object of star ratings');
    for (const question of this.survey) {
      const rating = ratings[question.id];
      if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) throw new Error(`rate "${question.question}" from 1 to 5 stars`);
    }
    this.surveyAnswers = Object.fromEntries(this.survey.map((question) => [question.id, ratings[question.id] as number]));
    this.host.mkdir(expand(STATE_DIR, this.host.home));
    this.host.write(surveyPath(this.ctx.id, this.host.home), `${JSON.stringify(this.surveyAnswers, null, 2)}\n`);
    void this.bootstrap();
  }

  private loadSurvey(): Record<string, number> | undefined {
    const saved = this.host.read(surveyPath(this.ctx.id, this.host.home));
    if (!saved?.content) return undefined;
    try {
      const value = JSON.parse(saved.content) as Record<string, unknown>;
      return this.survey.every((question) => Number.isInteger(value[question.id])) ? value as Record<string, number> : undefined;
    } catch {
      return undefined;
    }
  }

  status(): LessonStatus {
    if (this.awaitingSurvey()) return {
      course: { id: this.ctx.id, title: this.course.title, summary: 'Tell the trainer about your experience so it can design a lab at your level.' },
      lessons: [], active: null, lastExplain: null, survey: { questions: this.survey },
    };
    if (this.aiUnavailable || !this.state) return {
      course: { id: this.ctx.id, title: this.course.title, summary: 'Waiting for the AI trainer to design this terminal lab.' },
      lessons: [], active: null,
      lastExplain: this.unavailableReason ? `AI trainer unavailable: ${this.unavailableReason}`
        : this.planning ? `AI trainer is generating your ${this.course.title} lab. This takes up to a minute; keep this window open.`
          : `AI trainer is ready to generate your ${this.course.title} lab.`,
    };
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
        step: {
          id: activeTask.id, task: activeTask.task, hints: activeTask.hints, recap: activeTask.recap,
          // Older syllabuses have no lesson text: teach from the explanation instead.
          teach: activeTask.teach || activeTask.explain || activeTask.objective,
        },
      } : null,
      lastExplain: state.lastFeedback,
    };
  }

  start(dayId: string): void {
    const state = this.requireState();
    let day = Number.parseInt(dayId.replace(/^day-/, ''), 10);
    let selected = state.syllabus.days.find((item) => item.day === day);
    if (!selected) {
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
    learningRuntime.activate(this.ctx.id);
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
  async waitForAssessment(): Promise<TrainerFeedback | undefined> {
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
    this.state.failures = {};
    this.save();
  }

  private failuresOn(taskId: string): number { return this.state?.failures?.[taskId] ?? 0; }

  private recordFailure(state: AIProgress, taskId: string): void {
    state.failures = { ...state.failures, [taskId]: this.failuresOn(taskId) + 1 };
  }

  private hintsGiven(taskId: string): number {
    return this.memory.entries.filter((entry) => entry.kind === 'hint' && entry.taskId === taskId).length;
  }

  private async askFor(kind: 'hint' | 'answer'): Promise<string> {
    const task = this.currentTask();
    if (!task) return 'There is no active task. Start a day with the course action first.';
    const failures = this.failuresOn(task.id);
    // The learner should find the answer themselves: until they have really tried, an answer request gets a nudge.
    if (kind === 'answer' && failures < REVEAL_AFTER_FAILURES) {
      const left = REVEAL_AFTER_FAILURES - failures;
      const hint = await this.askFor('hint');
      return `You can work this one out. A nudge instead: ${hint}\nKeep trying: after ${left} more ${left === 1 ? 'try' : 'tries'} I'll start showing you the answer.`;
    }
    // Each hint gets a little more specific; the task's own hints are ordered from vague to close.
    const localHint = task.hints[Math.min(this.hintsGiven(task.id), task.hints.length - 1)] ?? 'Re-read the lesson above and try one small command.';
    const localAnswer = this.ctx.id === 'learn-linux' ? conciseLinuxAnswer(task.answer, task) : task.answer;
    let text: string;
    if (!this.ctx.learning) text = kind === 'hint' ? localHint : localAnswer;
    else {
      try {
        const result = await this.ctx.learning.request(`/${kind}`, {
          module: this.ctx.id, trainer: this.profile, task, failures, hintsGiven: this.hintsGiven(task.id), memory: this.taskMemory(task.id),
        });
        const responseText = (result as { text?: string }).text ?? (kind === 'hint' ? localHint : task.answer);
        text = this.ctx.id === 'learn-linux' && kind === 'answer' ? conciseLinuxAnswer(responseText, task) : responseText;
      } catch {
        text = kind === 'hint' ? localHint : localAnswer;
      }
    }
    this.remember({ kind, taskId: task.id, summary: text });
    return kind === 'answer' ? `${text}\nNow type it yourself to finish the task.` : text;
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
    if (!correct) this.recordFailure(state, task.id);
    this.remember({ kind: 'attempt', taskId: task.id, summary: `${run.line || 'session opened'} — ${state.lastFeedback}`, correct });
    if (correct) this.advanceTask(state, task);
    this.save();
  }

  private async evaluate(task: AITask, run: ShellRun): Promise<TrainerFeedback> {
    let result: { correct?: boolean; feedback?: string; next?: string } = {};
    try {
      if (!this.ctx.learning) throw new Error('AI learning service is not configured');
      result = await this.ctx.learning.request('/evaluate', {
        module: this.ctx.id, trainer: this.profile, task, command: run, failures: this.failuresOn(task.id),
        ...(this.ctx.id === 'learn-linux' ? {} : { memory: this.memory }),
      }) as typeof result;
    } catch {
      // Without the service, fall back to a conservative command-name check and teach rather than auto-pass.
      result = { correct: task.answer.trim().split(/\s+/)[0] === run.commands[0], feedback: 'Check the command, its arguments, and the command output.' };
    }
    const state = this.requireState();
    state.lastResult = result.correct ? 'correct' : 'wrong';
    const feedback = result.feedback ?? (result.correct ? 'Correct.' : 'Not yet. Check the command and output.');
    state.lastFeedback = this.ctx.id === 'learn-linux' ? compactLine(feedback, 110) : feedback;
    const evidence = `command=${JSON.stringify(run.line)} exit=${run.code} stdout=${JSON.stringify(run.stdout.slice(0, 300))} stderr=${JSON.stringify(run.stderr.slice(0, 200))}`;
    this.remember({ kind: 'attempt', taskId: task.id, summary: `${evidence} — ${state.lastFeedback}`, correct: !!result.correct });
    this.remember({ kind: 'feedback', taskId: task.id, summary: state.lastFeedback, correct: !!result.correct });
    if (result.correct) this.advanceTask(state, task);
    else this.recordFailure(state, task.id);
    this.save();
    return { correct: !!result.correct, text: state.lastFeedback };
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
    const saved = this.host.read(progressPath(this.ctx.id, this.host.home));
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

  private taskMemory(taskId: string): LearningMemory {
    return {
      moduleId: this.ctx.id,
      entries: this.memory.entries.filter((entry) => entry.taskId === taskId).slice(-3)
        .map((entry) => ({ ...entry, summary: entry.summary.slice(0, 220) })),
    };
  }

  private save(): void {
    const state = this.requireState();
    this.host.mkdir(expand(STATE_DIR, this.host.home));
    this.host.write(progressPath(this.ctx.id, this.host.home), `${JSON.stringify(state, null, 2)}\n`);
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

function compactLine(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  const prefix = compact.slice(0, maxLength - 1);
  const boundary = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, boundary > Math.floor(maxLength / 2) ? boundary : prefix.length).trimEnd()}…`;
}

function conciseLinuxAnswer(value: string, task: AITask): string {
  const hasLessonFormatting = /#{1,6}\s|\*\*|```|Safety Considerations:|Follow-up (?:Check|check):|Expected Output:/i.test(value);
  const proposed = value.replace(/\s+/g, ' ').trim();
  const answer = proposed.length <= MAX_LINUX_ANSWER && !hasLessonFormatting
    ? proposed
    : `${task.answer} — ${task.explain || task.objective}`;
  return compactLine(answer, MAX_LINUX_ANSWER);
}

const courseRunners = new Map<string, AICourseRunner>();
let activeModuleId: string | undefined;

export const learningRuntime = {
  get(moduleId?: string): AICourseRunner | undefined {
    return courseRunners.get(moduleId ?? activeModuleId ?? '');
  },
  register(moduleId: string, runner: AICourseRunner): void {
    courseRunners.set(moduleId, runner);
    if (!activeModuleId || runner.status().active) activeModuleId = moduleId;
  },
  activate(moduleId: string): void {
    if (courseRunners.has(moduleId)) activeModuleId = moduleId;
  },
  unregister(moduleId: string, runner: AICourseRunner): void {
    if (courseRunners.get(moduleId) !== runner) return;
    courseRunners.delete(moduleId);
    if (activeModuleId === moduleId) activeModuleId = courseRunners.keys().next().value;
  },
};

export async function activateAICourse(ctx: ModuleContext, course: Course, profile: TrainerProfile, options?: AICourseOptions): Promise<() => void> {
  const runner = new AICourseRunner(ctx, course, profile, moduleLessonHost(ctx, course.id), options);
  learningRuntime.register(ctx.id, runner);
  // Planning a syllabus can take the AI half a minute: do it in the background so logging in never waits for
  // it. Until it is ready the course reports that the trainer is generating the first lab. bootstrap() never
  // rejects; failures become the unavailable state or the local fallback.
  void runner.bootstrap();
  registerAIActions(ctx, runner);
  return () => { learningRuntime.unregister(ctx.id, runner); runner.dispose(); };
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
  ctx.registerAction({
    type: `${ctx.id}.survey`, capability: 'lessons:write', mutates: false,
    description: 'Submit the learner\'s 1-5 star experience ratings, by question id, so the trainer designs a syllabus at their level.',
    params: { type: 'object', properties: { answers: { type: 'object' } }, required: ['answers'] },
    run: (_action, payload) => {
      try { runner.submitSurvey((payload as { answers?: unknown })?.answers); } catch (error) {
        throw new KernelError('EINVAL', error instanceof Error ? error.message : String(error));
      }
      return runner.status();
    },
  });
  ctx.registerAction({ type: `${ctx.id}.quit`, capability: 'lessons:write', mutates: false, description: 'Leave the current AI learning task.', run: () => { runner.quit(); return runner.status(); } });
  ctx.registerAction({ type: `${ctx.id}.reset`, capability: 'lessons:write', mutates: false, description: 'Reset AI learning progress.', run: () => { runner.reset(); return runner.status(); } });
  ctx.registerAction({ type: `${ctx.id}.retry`, capability: 'lessons:write', mutates: false, description: 'Retry AI syllabus generation when the trainer service was unavailable.', run: async () => { await runner.bootstrap(); return runner.status(); } });
}

function fallbackProgress(course: Course, trainer: TrainerProfile, courseId: string): AIProgress {
  const tasks = course.lessons.map((lesson, lessonIndex) => ({
    day: lessonIndex + 1, title: lesson.title, recap: lessonIndex > 0,
    tasks: lesson.steps.map((step, index) => ({
      id: step.id, title: `Task ${index + 1}`, scenario: lesson.story, task: step.task,
      objective: step.explain ?? lesson.title, hints: step.hints, answer: solutionText(lesson, index), explain: step.explain ?? '', recap: lessonIndex > 0 && index === 0,
    })),
  }));
  return { syllabus: { courseId, title: course.title, summary: course.summary, trainer, days: tasks }, generatedByAI: false, completed: [], active: null, lastFeedback: null, lastResult: null };
}

function solutionText(lesson: Lesson, index: number): string {
  const solution = lesson.solution[index] as SolutionStep | undefined;
  return typeof solution === 'string' ? solution : solution ? `Open ${solution.open}` : 'Review the task and try again.';
}

function validateSyllabus(value: AISyllabus, courseId: string): void {
  if (!value || value.courseId !== courseId || !Array.isArray(value.days) || value.days.length < 1) throw new Error('invalid AI syllabus');
  for (const [index, day] of value.days.entries()) {
    if (day.day !== index + 1 || !day.title || !Array.isArray(day.tasks) || !day.tasks.length || day.recap !== (index > 0)) throw new Error('invalid AI syllabus day');
    for (const [taskIndex, task] of day.tasks.entries()) {
      if (!task.id || !task.task || !task.scenario || !Array.isArray(task.hints) || !task.answer || task.recap !== (index > 0 && taskIndex === 0)) throw new Error('invalid AI task or missing recap marker');
      if (courseId === 'learn-linux' && /[\r\n;]|&&|\|\|/.test(task.answer)) throw new Error('AI Linux tasks must have exactly one command per question.');
    }
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
