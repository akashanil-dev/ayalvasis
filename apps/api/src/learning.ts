import type { TutorConfig, Reply } from './tutor.ts';

export type LearningOperation = 'plan' | 'evaluate' | 'hint' | 'answer';

export interface TrainerProfile {
  id: string;
  title: string;
  specialty: string;
  level: string;
  scenarioFocus: string;
}

const PERSONAS: Record<string, TrainerProfile> = {
  'learn-linux': {
    id: 'linux-certifier', title: 'Linux Certification Trainer', level: 'beginner to advanced',
    specialty: 'an industry Linux administrator and Linux certification assessor',
    scenarioFocus: 'on-call incidents, production runbooks, hardening, logs, permissions, networking, and certification labs',
  },
  'learn-docker': {
    id: 'docker-platform-engineer', title: 'Docker Platform Engineering Trainer', level: 'beginner to advanced',
    specialty: 'a production platform engineer',
    scenarioFocus: 'deployment tickets, broken services, container debugging, networking, image security, and release hygiene',
  },
  terminal: {
    id: 'terminal-operations-coach', title: 'Terminal Operations Coach', level: 'beginner to advanced',
    specialty: 'a senior site reliability engineer who teaches shell fluency',
    scenarioFocus: 'realistic support tickets, automation, diagnosis, safe changes, and incident response',
  },
  'chmod-arcade': {
    id: 'security-permissions-trainer', title: 'Linux Security Trainer', level: 'beginner to advanced',
    specialty: 'a Linux security engineer',
    scenarioFocus: 'least privilege, deploy permissions, service accounts, and secure file handling',
  },
};

const MODULES = new Set(Object.keys(PERSONAS));

export async function handleLearning(body: unknown, config: TutorConfig, fetcher: typeof fetch = fetch): Promise<Reply> {
  const problem = invalidLearning(body);
  if (problem) return { status: 400, body: { error: problem } };
  if (!config.apiKey) return { status: 503, body: { error: 'AI learning is not configured: set OPENAI_API_KEY on the API server.' } };
  const request = body as Record<string, unknown>;
  const moduleId = request.module as string;
  const trainer = PERSONAS[moduleId]!;
  const operation = request.operation as LearningOperation;
  const prompt = promptFor(operation, { ...request, trainer });
  const model = config.learningModels?.[moduleId] ?? config.model;
  try {
    const response = await fetcher(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: trainerPrompt(trainer) },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await response.json().catch(() => null) as {
      choices?: { message?: { content?: string | null } }[];
      error?: { message?: string };
    } | null;
    if (!response.ok) return { status: response.status === 429 ? 429 : 502, body: { error: data?.error?.message ?? `AI service returned HTTP ${response.status}` } };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { status: 502, body: { error: 'AI learning service returned an empty response.' } };
    let result: unknown;
    try { result = JSON.parse(content); } catch { return { status: 502, body: { error: 'AI learning service returned invalid structured data.' } }; }
    const invalid = validateResult(operation, result);
    return invalid ? { status: 502, body: { error: invalid } } : { status: 200, body: result };
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    return { status: 504, body: { error: timeout ? 'AI learning took too long. Try again.' : 'AI learning service could not be reached.' } };
  }
}

export function invalidLearning(body: unknown): string | null {
  const value = body as { operation?: unknown; module?: unknown } | null;
  if (!value || typeof value.operation !== 'string' || !['plan', 'evaluate', 'hint', 'answer'].includes(value.operation)) return 'operation must be plan, evaluate, hint, or answer.';
  if (typeof value.module !== 'string' || !MODULES.has(value.module)) return 'module is not supported.';
  const json = JSON.stringify(body);
  if (json.length > 100_000) return 'learning request is too large.';
  const memory = (body as { memory?: unknown })?.memory;
  if (memory !== undefined && (!memory || typeof memory !== 'object' || !Array.isArray((memory as { entries?: unknown }).entries))) return 'memory must contain an entries array.';
  if (memory !== undefined && (memory as { moduleId?: unknown }).moduleId !== value.module) return 'memory must belong to the requested module.';
  return null;
}

function trainerPrompt(trainer: TrainerProfile): string {
  return `You are ${trainer.title}, ${trainer.specialty}. Teach ${trainer.level} learners through ${trainer.scenarioFocus}. `
    + 'Use industry scenarios, safe commands, observable terminal outcomes, and explanations that build transferable judgment. '
    + 'Never invent that a command ran; evaluate only the evidence supplied. Return JSON only.';
}

function promptFor(operation: LearningOperation, request: Record<string, unknown>): string {
  const memory = JSON.stringify(request.memory ?? { entries: [] });
  if (operation === 'plan') return `Design a seven-day terminal-first syllabus for ${request.module}. `
    + 'Day 1 must start from beginner level. Each later day must begin with exactly one recap task referencing earlier skills. '
    + 'Every task must be an industry scenario with a concrete terminal objective, a safe expected answer, three progressive hints, and a teaching explanation. '
    + 'Do not ask learners to change real machines; this is a sandbox. Return {courseId,title,summary,trainer,days:[{day,title,recap,tasks:[{id,title,scenario,task,objective,hints,answer,explain}]}]}. '
    + `Use this reviewed fallback only as topic context: ${JSON.stringify(request.fallback ?? {})}. `
    + `Use only this module's local memory as continuity context: ${memory}`;
  if (operation === 'evaluate') return `Assess the learner's terminal attempt against this task. Return {correct,feedback,next} where correct is true only when the command and its observable output satisfy the objective. Be specific, encouraging, and teach the underlying concept. Task: ${JSON.stringify(request.task)} Attempt: ${JSON.stringify(request.command)} Local module memory: ${memory}`;
  if (operation === 'hint') return `Give one progressive hint for this terminal task without revealing the full answer. Return {text}. Task: ${JSON.stringify(request.task)} Local module memory: ${memory}`;
  return `Teach the detailed solution for this terminal task. Include the exact command, explain each important token, expected output/evidence, safety considerations, and a small follow-up check. Return {text}. Task: ${JSON.stringify(request.task)} Local module memory: ${memory}`;
}

function validateResult(operation: LearningOperation, value: unknown): string | null {
  const object = value as Record<string, unknown> | null;
  if (!object || typeof object !== 'object') return 'AI result must be an object.';
  if (operation === 'plan') {
    if (typeof object.courseId !== 'string' || !Array.isArray(object.days) || object.days.length < 1) return 'AI syllabus is incomplete.';
    if ((object.days as { day?: unknown; recap?: unknown }[]).some((day) => typeof day.day !== 'number' || (day.day > 1 && day.recap !== true))) return 'AI syllabus must begin each day after day one with a recap task.';
    return null;
  }
  if (typeof object.text !== 'string' && operation !== 'evaluate') return 'AI teaching response is incomplete.';
  if (operation === 'evaluate' && typeof object.correct !== 'boolean') return 'AI evaluation is incomplete.';
  return null;
}
