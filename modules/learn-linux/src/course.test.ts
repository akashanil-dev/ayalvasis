// Lesson CI: every lesson's own solution must complete it in a fresh system. If a shell change or a
// content edit breaks a lesson, this fails instead of a learner getting stuck.

import { validateCourse, type LessonStatus } from '@tuxos/lessons';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { describe, expect, it } from 'vitest';
import { files } from '../../files/src/index';
import { course, learnLinux } from './index';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function boot(): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(),
    modules: [
      { manifest: learnLinux.manifest, load: async () => learnLinux },
      { manifest: files.manifest, load: async () => files },
    ],
  });
  await system.boot('ada');
  return system;
}

async function status(system: SystemClient): Promise<LessonStatus> {
  const result = await system.dispatch<LessonStatus>('learn-linux.status', {});
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('Learn Linux course', () => {
  it('is valid', () => {
    expect(validateCourse(course)).toEqual([]);
  });

  it.each(course.lessons.map((lesson) => [lesson.id]))('lesson %s is completed by its own solution', async (id) => {
    const system = await boot();
    const lesson = course.lessons.find((each) => each.id === id)!;
    expect(await system.dispatch('learn-linux.start', { lesson: id })).toMatchObject({ ok: true });
    const terminal = await system.createTerminal();
    for (const step of lesson.solution) {
      if (typeof step === 'string') await terminal.run(step);
      else await system.openApp(step.open);
    }
    const after = await status(system);
    expect(after.active).toBeNull();
    expect(after.lessons.find((each) => each.id === id)).toMatchObject({ completed: lesson.steps.length });
  });

  it('does not count a step done by doing something else', async () => {
    const system = await boot();
    await system.dispatch('learn-linux.start', { lesson: 'first-words' });
    const terminal = await system.createTerminal();
    await terminal.run('pwd');
    await terminal.run('who');
    expect((await status(system)).active?.step.id).toBe('whoami');
  });

  it('keeps progress in a file in the learner home, and resumes it after a restart', async () => {
    const storage = memory();
    const make = () => createLocalSystem({
      storage, modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    const first = make();
    await first.boot('ada');
    await first.dispatch('learn-linux.start', { lesson: 'first-words' });
    await (await first.createTerminal()).run('whoami');
    const progressFile = '/home/ada/.local/share/tuxos/learn-linux.json';
    const saved = await first.dispatch<string>('fs.read', { path: progressFile });
    expect(saved.ok && JSON.parse(saved.value)).toMatchObject({ active: { lesson: 'first-words', step: 1 } });
    await first.flush();

    const second = make();
    await second.boot('ada');
    expect((await status(second)).active?.step.id).toBe('pwd');
    await (await second.createTerminal()).run('pwd');
    expect((await status(second)).active?.step.id).toBe('ls');
  });

  it('rejects unknown lessons with a clear error', async () => {
    const system = await boot();
    expect(await system.dispatch('learn-linux.start', { lesson: 'nope' })).toMatchObject({
      ok: false, error: { code: 'ENOENT' },
    });
  });
});
