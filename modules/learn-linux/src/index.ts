import { LessonRunner, validateCourse, type Course, type LessonHost, type Progress } from '@ayalvasis/lessons';
import { KernelError } from '@ayalvasis/kernel';
import type { ModuleContext, ModuleDefinition } from '@ayalvasis/sdk';
import courseData from './course.json';
import { manifest } from './manifest';

export { manifest } from './manifest';

export const course = courseData as Course;

export const learnLinux: ModuleDefinition = {
  manifest,
  activate(ctx) {
    const problems = validateCourse(course);
    if (problems.length) throw new Error(`course is invalid: ${problems.join('; ')}`);
    const runner = new LessonRunner(course, moduleLessonHost(ctx, course.id));
    registerLessonActions(ctx, runner);
    return () => runner.dispose();
  },
};

export default learnLinux;

/**
 * Lesson actions only orchestrate: the file changes they cause go through their own fs.* dispatches,
 * so the actions themselves are marked non-mutating.
 */
export function registerLessonActions(ctx: ModuleContext, runner: LessonRunner): void {
  const lessonId = (payload: unknown) => {
    const id = (payload as { lesson?: unknown } | null)?.lesson;
    if (typeof id !== 'string') throw new KernelError('EINVAL', '"lesson" must be a string');
    if (!runner.status().lessons.some((lesson) => lesson.id === id)) {
      throw new KernelError('ENOENT', `no such lesson: ${id}`);
    }
    return id;
  };
  ctx.registerAction({
    type: `${ctx.id}.status`, capability: 'lessons:read', mutates: false,
    description: 'Show the course, progress, and the current lesson step with its hints.',
    run: () => runner.status(),
  });
  ctx.registerAction({
    type: `${ctx.id}.start`, capability: 'lessons:write', mutates: false,
    description: 'Start (or restart) a lesson by id.',
    run: (_actionCtx, payload) => {
      runner.start(lessonId(payload));
      return runner.status();
    },
  });
  ctx.registerAction({
    type: `${ctx.id}.quit`, capability: 'lessons:write', mutates: false,
    description: 'Leave the current lesson. Completed steps are kept.',
    run: () => runner.quit(),
  });
  ctx.registerAction({
    type: `${ctx.id}.reset`, capability: 'lessons:write', mutates: false,
    description: 'Forget all progress in this course.',
    run: () => runner.reset(),
  });
}

/** Progress lives in a hidden file in the learner's home, the way Linux apps keep their data. */
export function moduleLessonHost(ctx: ModuleContext, courseId: string): LessonHost {
  const home = `/home/${ctx.user}`;
  const dataDir = `${home}/.local/share/ayalvasis`;
  const progressFile = `${dataDir}/${courseId}.json`;
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
    load() {
      const saved = read<string>('fs.read', progressFile);
      if (!saved.ok) return undefined;
      try {
        return JSON.parse(saved.value) as Progress;
      } catch {
        ctx.log(`ignoring unreadable progress file ${progressFile}`);
        return undefined;
      }
    },
    save(progress) {
      ctx.dispatch('fs.mkdir', { path: dataDir, parents: true });
      ctx.dispatch('fs.write', { path: progressFile, content: `${JSON.stringify(progress, null, 2)}\n` });
    },
  };
}
