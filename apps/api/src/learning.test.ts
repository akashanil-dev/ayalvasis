import { describe, expect, it } from 'vitest';
import { fixedTemperature, handleLearning, invalidLearning } from './learning.ts';
import type { TutorConfig } from './tutor.ts';

const config: TutorConfig = { apiKey: 'test-key', model: 'test-model', baseUrl: 'https://ai.example/v1', learningModels: { 'learn-linux': 'linux-model' } };

function upstream(content: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] }, { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('AI learning backend', () => {
  it('uses the server persona and requests structured syllabus JSON', async () => {
    const syllabus = { courseId: 'model-picked-wrong-id', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: false }] },
      { day: 2, title: 'Operations', recap: true, tasks: [
        { id: 'r', title: 'Recap', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: true },
        { id: 't2', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'ls', explain: 'why', recap: false },
      ] },
    ] };
    const { fetcher, calls } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux', fallback: {} }, config, fetcher);
    expect(reply).toEqual({ status: 200, body: { ...syllabus, courseId: 'learn-linux' } });
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.model).toBe('linux-model');
    expect(request.messages[0].content).toContain('Linux Certification Trainer');
    expect(request.messages[0].content).not.toContain('trainer supplied by browser');
    expect(request.messages[1].content).toContain('tasks[0].recap=true');
    expect(request.messages[1].content).toContain('exactly ONE terminal command');
    expect(request.messages[1].content).toContain('A recap checks one previously learned skill');
  });

  it('leaves out temperature for models that only accept the default', async () => {
    const plan = { courseId: 'learn-linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: false }] },
    ] };
    const reasoning = upstream(plan);
    await handleLearning({ operation: 'plan', module: 'learn-linux' }, { ...config, learningModels: { 'learn-linux': 'gpt-5.6-luna' } }, reasoning.fetcher);
    const sent = JSON.parse(reasoning.calls[0]!.init.body as string);
    expect(sent).not.toHaveProperty('temperature');
    expect(sent.reasoning_effort).toBe('low');
    const classic = upstream(plan);
    await handleLearning({ operation: 'plan', module: 'learn-linux' }, { ...config, learningModels: { 'learn-linux': 'gpt-4.1-mini' } }, classic.fetcher);
    expect(JSON.parse(classic.calls[0]!.init.body as string)).toMatchObject({ temperature: 0.3 });
    expect(JSON.parse(classic.calls[0]!.init.body as string)).not.toHaveProperty('reasoning_effort');
    expect([fixedTemperature('gpt-5.6-luna'), fixedTemperature('o4-mini'), fixedTemperature('gpt-4.1-mini')]).toEqual([true, true, false]);
  });

  it('does not send cached attempt history into syllabus generation', async () => {
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'Print the username', scenario: 'An on-call handoff', objective: 'Show the current user', hints: ['Check the shell identity'], answer: 'whoami', explain: 'whoami prints the active user.', recap: false }] },
    ] };
    const { fetcher, calls } = upstream(syllabus);
    await handleLearning({ operation: 'plan', module: 'learn-linux', memory: { moduleId: 'learn-linux', entries: [{ id: 'old', kind: 'answer', summary: 'LONG PRIVATE OLD SESSION', at: 1 }] } }, config, fetcher);
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.messages[1].content).not.toContain('LONG PRIVATE OLD SESSION');
    expect(request.messages[1].content).toContain('Do not include or depend on learner attempt history');
  });

  it('rejects Linux syllabus tasks with chained commands', async () => {
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'Do two things', scenario: 'y', objective: 'z', hints: ['h'], answer: 'whoami && cd ~', explain: 'why', recap: false }] },
    ] };
    const { fetcher } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux' }, config, fetcher);
    expect(reply).toMatchObject({ status: 502, body: { error: 'AI Linux tasks must have exactly one command per question.' } });
  });

  it('rejects a syllabus whose later day is marked recap but has no recap task', async () => {
    const syllabus = { courseId: 'linux', title: 'Linux', summary: 'Lab', days: [
      { day: 1, title: 'Basics', recap: false, tasks: [{ id: 't', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'pwd', explain: 'why', recap: false }] },
      { day: 2, title: 'Operations', recap: true, tasks: [{ id: 't2', title: 'Task', task: 'x', scenario: 'y', objective: 'z', hints: ['h'], answer: 'ls', explain: 'why', recap: false }] },
    ] };
    const { fetcher } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux' }, config, fetcher);
    expect(reply).toMatchObject({ status: 502, body: { error: 'Every day after day one must begin with exactly one task marked as a recap.' } });
  });

  it('keeps continuity context module-scoped and validates its shape', async () => {
    const { fetcher, calls } = upstream({ text: 'Use ls -la.' });
    const reply = await handleLearning({ operation: 'hint', module: 'terminal', task: { id: 't' }, memory: { moduleId: 'terminal', entries: [{ id: '1', kind: 'attempt', summary: 'previous shell attempt', at: 1 }] } }, config, fetcher);
    expect(reply.status).toBe(200);
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.messages[1].content).toContain('previous shell attempt');
    expect(invalidLearning({ operation: 'hint', module: 'terminal', task: {}, memory: { entries: 'not-an-array' } })).toContain('entries array');
    expect(invalidLearning({ operation: 'hint', module: 'terminal', task: {}, memory: { moduleId: 'learn-linux', entries: [] } })).toContain('requested module');
  });

  it('evaluates a terminal attempt and rejects unsupported requests before upstream', async () => {
    const { fetcher, calls } = upstream({ correct: true, feedback: 'Correct. '.repeat(30) + '\nThis second line should be removed.', next: 'Continue' });
    const reply = await handleLearning({
      operation: 'evaluate', module: 'learn-linux', task: { id: 't', task: 'list files', scenario: 'incident', hints: ['h'], answer: 'ls' },
      command: { line: 'docker run nginx', code: 0, stdout: 'ok', stderr: '', commands: ['docker'] },
      memory: { moduleId: 'learn-linux', entries: [{ id: 'previous', kind: 'attempt', taskId: 't', summary: 'previous shell attempt', at: 1 }] },
    }, config, fetcher);
    expect(reply).toMatchObject({ status: 200, body: { correct: true } });
    const feedback = (reply.body as { feedback: string }).feedback;
    expect(feedback.length).toBeLessThanOrEqual(110);
    expect(feedback).not.toContain('\n');
    expect(calls).toHaveLength(1);
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.model).toBe('linux-model');
    expect(request.messages[1].content).toContain('maximum 110 characters');
    expect(request.messages[1].content).toContain('current single submitted command');
    expect(request.messages[1].content).toContain('Ignore all previous commands');
    expect(request.messages[1].content).not.toContain('previous shell attempt');
    expect(invalidLearning({ operation: 'plan', module: 'unknown' })).toContain('not supported');
  });

  it('keeps Linux /answer to one short terminal line', async () => {
    const { fetcher, calls } = upstream({ text: `Use whoami, then cd ~ to confirm your login and return home. ${'Detailed teaching section. '.repeat(20)}\n## Follow-up` });
    const reply = await handleLearning({ operation: 'answer', module: 'learn-linux', task: { id: 'recap', task: 'Confirm user and return home' } }, config, fetcher);
    expect(reply.status).toBe(200);
    const text = (reply.body as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(140);
    expect(text).not.toContain('\n');
    expect(text).not.toContain('##');
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.model).toBe('linux-model');
    expect(request.messages[1].content).toContain('Maximum 140 characters');
  });

  it('does not call upstream without a key', async () => {
    const { fetcher, calls } = upstream({ text: 'hint' });
    const reply = await handleLearning({ operation: 'hint', module: 'terminal', task: {} }, { ...config, apiKey: undefined }, fetcher);
    expect(reply.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});
