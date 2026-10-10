// POST /api/tutor: validate the browser's request, add the tutor's instructions, call the model once,
// and return its message. Stateless: the browser keeps the conversation, so the server scales out freely.

import { SYSTEM_PROMPT } from './prompt.ts';

export interface TutorConfig {
  apiKey: string | undefined;
  model: string;
  baseUrl: string;
  learningModels?: Record<string, string>;
}

export interface Reply {
  status: number;
  body: unknown;
}

const LIMITS = { messages: 60, tools: 40, content: 20_000 };
const ROLES = new Set(['user', 'assistant', 'tool']);

export async function handleTutor(body: unknown, config: TutorConfig, fetcher: typeof fetch = fetch): Promise<Reply> {
  if (!config.apiKey) {
    return failure(503, 'The tutor is not set up yet: the server needs an OPENAI_API_KEY (see .env.example).');
  }
  const problem = invalid(body);
  if (problem) return failure(400, problem);
  const { messages, tools } = body as { messages: unknown[]; tools: unknown[] };

  let response: Response;
  try {
    response = await fetcher(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return failure(504, timedOut ? 'The tutor took too long to answer. Please try again.'
      : 'The tutor could not reach the AI service. Check the server\'s internet connection.');
  }

  const data = await response.json().catch(() => null) as {
    choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    return failure(upstreamStatus(response.status), upstreamMessage(response.status, data?.error?.message));
  }
  const message = data?.choices?.[0]?.message;
  if (!message) return failure(502, 'The AI service sent an empty reply.');
  return {
    status: 200,
    body: {
      message: {
        role: 'assistant',
        content: message.content ?? null,
        ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
      },
    },
  };
}

/** Why a request is unacceptable, or null if it is fine. Only shape and size: content is the model's job. */
export function invalid(body: unknown): string | null {
  const value = body as { messages?: unknown; tools?: unknown } | null;
  if (!value || !Array.isArray(value.messages) || !Array.isArray(value.tools)) return 'Expected { messages, tools }.';
  if (!value.messages.length || value.messages.length > LIMITS.messages) return 'Too many or too few messages.';
  if (value.tools.length > LIMITS.tools) return 'Too many tools.';
  for (const message of value.messages as { role?: unknown; content?: unknown }[]) {
    // The system message is added here; a browser may not send its own.
    if (!ROLES.has(message?.role as string)) return 'Messages must come from the user, the assistant or a tool.';
    if (typeof message.content === 'string' && message.content.length > LIMITS.content) return 'A message is too long.';
  }
  return null;
}

/** Pass "slow down" through to the browser; anything else from upstream is a bad gateway for us. */
function upstreamStatus(status: number): number {
  return status === 429 ? 429 : 502;
}

function upstreamMessage(status: number, detail: string | undefined): string {
  if (status === 401) return 'The AI service rejected the server\'s API key.';
  if (status === 429) return 'The tutor is getting too many requests or is out of credits. Try again in a minute.';
  if (status === 404) return `The AI model configured on the server was not found${detail ? `: ${detail}` : ''}.`;
  return `The AI service returned an error (HTTP ${status})${detail ? `: ${detail}` : ''}.`;
}

function failure(status: number, error: string): Reply {
  return { status, body: { error } };
}
