// Lesson CI: every lesson's own solution must complete it in a fresh system. If a shell change or a
// content edit breaks a lesson, this fails instead of a learner getting stuck.

import { validateCourse, type LessonStatus } from '@tuxos/lessons';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import type { LearningBackend } from '@tuxos/sdk';
import { describe, expect, it } from 'vitest';
import { course, learnLinux, survey } from './index';
import { terminal } from '../../terminal/src/index';
import { learnDocker } from '../../learn-docker/src/index';

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

/** Tests model the API response; production Linux never uses the reviewed JSON as a learner fallback. */
const aiLearning = (): LearningBackend => ({
  async request(path, body) {
    const request = body as { module?: string; task?: { answer?: string }; command?: { line?: string } };
    if (path === '/plan') return {
      courseId: request.module, title: request.module === 'learn-linux' ? 'AI Linux Lab' : 'AI Docker Lab', summary: 'Generated test syllabus', trainer: {},
      days: course.lessons.map((lesson, day) => ({ day: day + 1, title: lesson.title, recap: day > 0, tasks: lesson.steps.map((step, index) => ({
        id: step.id, title: `AI task ${index + 1}`, scenario: lesson.story, task: step.task, objective: step.explain ?? lesson.title,
        hints: step.hints, answer: request.module === 'learn-docker' ? 'docker --version' : day === 0 && index === 0 ? 'whoami' : day === 0 && index === 1 ? 'pwd' : `echo task-${day + 1}-${index + 1}`, explain: step.explain ?? '', recap: day > 0 && index === 0,
      })) })),
    };
    if (path === '/evaluate') return { correct: request.command?.line?.trim() === request.task?.answer?.trim() || request.task?.answer?.startsWith('Open '), feedback: 'AI test assessment' };
    if (path === '/hint') return { text: 'AI test hint' };
    return { text: `### Detailed Solution for ${request.module}\n\n**Exact command:**\n\n\`\`\`bash\nwhoami\n\`\`\`\n\n${'Long lesson section. '.repeat(30)}` };
  },
});

/** The learner rates their experience; the syllabus is designed only after that. */
async function rate(system: SystemClient, stars = 3): Promise<void> {
  const result = await system.dispatch('learn-linux.survey', { answers: Object.fromEntries(survey.map((question) => [question.id, stars])) });
  if (!result.ok) throw new Error(result.error.message);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(withDocker = false, learning: LearningBackend = aiLearning()): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(),
    learning,
    modules: [
      { manifest: learnLinux.manifest, load: async () => learnLinux },
      { manifest: terminal.manifest, load: async () => terminal },
      ...(withDocker ? [{ manifest: learnDocker.manifest, load: async () => learnDocker }] : []),
    ],
  });
  await system.boot('ada');
  await rate(system);
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

  it('asks about the learner\'s experience first and designs the syllabus from their ratings', async () => {
    const plans: Record<string, unknown>[] = [];
    const fixture = aiLearning();
    const system = createLocalSystem({
      storage: memory(),
      learning: { request: async (path, body) => {
        if (path === '/plan') plans.push(body as Record<string, unknown>);
        return fixture.request(path, body);
      } },
      modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    await system.boot('ada');
    const waiting = await status(system);
    expect(waiting.survey?.questions).toHaveLength(survey.length);
    expect(plans).toHaveLength(0);
    expect(await system.dispatch('learn-linux.survey', { answers: { terminal: 6 } })).toMatchObject({ ok: false, error: { code: 'EINVAL' } });
    await rate(system, 5);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.survey).toEqual(survey.map((question) => ({ question: question.question, rating: 5 })));
    const ready = await status(system);
    expect(ready.survey).toBeUndefined();
    expect(ready.course.title).toBe('AI Linux Lab');
  });

  it('lets the learner retake the survey: cancelling keeps the lab, new answers design a new one', async () => {
    const plans: Record<string, unknown>[] = [];
    const fixture = aiLearning();
    const system = await boot(false, { request: async (path, body) => {
      if (path === '/plan') plans.push(body as Record<string, unknown>);
      return fixture.request(path, body);
    } });
    await (await system.createTerminal({ learningModule: 'learn-linux' })).run('whoami');
    expect((await status(system)).active?.step.id).toBe('pwd');

    await system.dispatch('learn-linux.retakeSurvey', {});
    expect((await status(system)).survey).toMatchObject({ retake: true });
    await system.dispatch('learn-linux.cancelSurvey', {});
    expect((await status(system)).active?.step.id).toBe('pwd');
    expect(plans).toHaveLength(1);

    await system.dispatch('learn-linux.retakeSurvey', {});
    await rate(system, 1);
    expect(plans).toHaveLength(2);
    expect(plans[1]!.survey).toEqual(survey.map((question) => ({ question: question.question, rating: 1 })));
    const fresh = await status(system);
    expect(fresh.survey).toBeUndefined();
    expect(fresh.lessons[0]?.completed).toBe(0);
  });

  it('lets the learner log in while the AI is still planning the syllabus', async () => {
    let finish: () => void = () => undefined;
    const slow: LearningBackend = {
      async request(path, body) {
        if (path === '/plan') await new Promise<void>((resolve) => { finish = resolve; });
        return aiLearning().request(path, body);
      },
    };
    const system = await boot(false, slow);
    expect((await status(system)).lastExplain).toContain('generating your Learn Linux lab');
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await status(system)).course.title).toBe('AI Linux Lab');
  });

  it('starts an AI-generated task and assesses terminal input', async () => {
    const system = await boot();
    const initial = await status(system);
    expect(initial.course.title).toBe('AI Linux Lab');
    expect(initial.active?.step.id).toBe('whoami');
    // Every task has a lesson to read first (here the syllabus has none, so its explanation is used).
    expect(initial.active?.step.teach).toBeTruthy();
    const terminal = await system.createTerminal({ learningModule: 'learn-linux' });
    // The trainer's verdict comes with the result, apart from the command's own output, so terminals can show it clearly.
    const wrong = await terminal.run('who');
    expect(wrong.feedback).toMatchObject({ correct: false });
    expect(wrong.feedback!.text.length).toBeLessThan(120);
    expect(wrong.stdout).not.toContain('Trainer');
    expect((await terminal.run('whoami')).feedback).toMatchObject({ correct: true });
    expect((await status(system)).active?.step.id).toBe('pwd');
  });

  it('keeps the syllabus request small by excluding cached memory', async () => {
    let planBody: Record<string, unknown> | undefined;
    const fixture = aiLearning();
    const system = await boot(false, { request: async (path, body) => {
      if (path === '/plan') planBody = body as Record<string, unknown>;
      return fixture.request(path, body);
    } });
    expect(await status(system)).toMatchObject({ course: { title: 'AI Linux Lab' } });
    expect(planBody).not.toHaveProperty('memory');
  });

  it('reports a rejected AI plan instead of leaving Linux in a pending state or showing local questions', async () => {
    const system = createLocalSystem({
      storage: memory(),
      learning: { request: async () => { throw new Error('Every day after day one must begin with exactly one task marked as a recap.'); } },
      modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    await system.boot('ada');
    await rate(system);
    const current = await status(system);
    expect(current.lessons).toHaveLength(0);
    expect(current.lastExplain).toContain('AI trainer unavailable: Every day after day one');
  });

  it('nudges instead of answering until the learner has missed five times, then reveals it to type', async () => {
    const system = await boot();
    const terminal = await system.createTerminal({ learningModule: 'learn-linux' });
    expect((await terminal.run('/hint')).stdout).toContain('AI test hint');
    const early = await terminal.run('/answer');
    expect(early.stdout).toContain('A nudge instead: AI test hint');
    expect(early.stdout).toContain('after 5 more tries');
    expect(early.stdout).not.toContain('whoami');
    for (let miss = 0; miss < 5; miss += 1) await terminal.run('ls');
    const answer = await terminal.run('/answer');
    expect(answer.stdout).toContain('whoami');
    expect(answer.stdout).toContain('Now type it yourself');
    expect(answer.stdout).not.toContain('Detailed Solution');
  });

  it('keeps Linux slash commands on the Linux trainer when Docker is active', async () => {
    const system = await boot(true);
    await system.dispatch('learn-docker.start', { lesson: 'day-1' });
    const linuxTerminal = await system.createTerminal({ learningModule: 'learn-linux' });
    for (let miss = 0; miss < 5; miss += 1) await linuxTerminal.run('ls');
    const answer = await linuxTerminal.run('/answer');
    expect(answer.stdout).toContain('whoami');
    expect(answer.stdout).not.toContain('docker --version');
  });

  it('keeps AI progress in the learner home and resumes it after a restart', async () => {
    const storage = memory();
    const make = () => createLocalSystem({
      storage, learning: aiLearning(), modules: [{ manifest: learnLinux.manifest, load: async () => learnLinux }],
    });
    const first = make();
    await first.boot('ada');
    await rate(first);
    await (await first.createTerminal()).run('whoami');
    const progressFile = '/home/ada/.local/share/tuxos/ai-learning/learn-linux-v2.json';
    const saved = await first.dispatch<string>('fs.read', { path: progressFile });
    expect(saved.ok && JSON.parse(saved.value)).toMatchObject({ completed: ['whoami'] });
    await first.flush();

    const second = make();
    await second.boot('ada');
    expect((await status(second)).lessons[0]?.completed).toBe(1);
    expect((await status(second)).active?.step.id).toBe('pwd');
  });

  it('rejects unknown lessons with a clear error', async () => {
    const system = await boot();
    expect(await system.dispatch('learn-linux.start', { lesson: 'nope' })).toMatchObject({
      ok: false, error: { code: 'ENOENT' },
    });
  });
});
