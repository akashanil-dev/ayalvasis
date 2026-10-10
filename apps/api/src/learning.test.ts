import { describe, expect, it } from 'vitest';
import { handleLearning, invalidLearning } from './learning.ts';
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
    const syllabus = { courseId: 'learn-linux', title: 'Linux', days: [{ day: 1, title: 'Basics', tasks: [{ id: 't', task: 'x', scenario: 'y', hints: ['h'], answer: 'pwd' }] }] };
    const { fetcher, calls } = upstream(syllabus);
    const reply = await handleLearning({ operation: 'plan', module: 'learn-linux', fallback: {} }, config, fetcher);
    expect(reply).toEqual({ status: 200, body: syllabus });
    const request = JSON.parse(calls[0]!.init.body as string);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.model).toBe('linux-model');
    expect(request.messages[0].content).toContain('Linux Certification Trainer');
    expect(request.messages[0].content).not.toContain('trainer supplied by browser');
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
    const { fetcher, calls } = upstream({ correct: true, feedback: 'Good', next: 'Continue' });
    const reply = await handleLearning({
      operation: 'evaluate', module: 'learn-docker', task: { id: 't', task: 'run nginx', scenario: 'incident', hints: ['h'], answer: 'docker run nginx' },
      command: { line: 'docker run nginx', code: 0, stdout: 'ok', stderr: '', commands: ['docker'] },
    }, config, fetcher);
    expect(reply).toMatchObject({ status: 200, body: { correct: true } });
    expect(calls).toHaveLength(1);
    expect(invalidLearning({ operation: 'plan', module: 'unknown' })).toContain('not supported');
  });

  it('does not call upstream without a key', async () => {
    const { fetcher, calls } = upstream({ text: 'hint' });
    const reply = await handleLearning({ operation: 'hint', module: 'terminal', task: {} }, { ...config, apiKey: undefined }, fetcher);
    expect(reply.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});
