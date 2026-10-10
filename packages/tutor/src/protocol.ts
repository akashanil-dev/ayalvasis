// The messages exchanged with the model, in the OpenAI Chat Completions shape. The browser keeps the
// conversation; the API server only adds the tutor's instructions and forwards one call at a time.

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface CompletionRequest {
  messages: ChatMessage[];
  tools: ToolSpec[];
}

/** How the tutor reaches the model. In the app it is an HTTP call to apps/api; in tests, a script. */
export interface Transport {
  complete(request: CompletionRequest): Promise<Extract<ChatMessage, { role: 'assistant' }>>;
}

export function httpTransport(url: string, fetcher: typeof fetch = fetch): Transport {
  return {
    async complete(request) {
      let response: Response;
      try {
        response = await fetcher(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        });
      } catch {
        throw new Error('The tutor service is not reachable. Is the API server running (npm run api)?');
      }
      const body = await response.json().catch(() => ({})) as { message?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error ?? `The tutor service failed (HTTP ${response.status}).`);
      if (!isAssistant(body.message)) throw new Error('The tutor service sent a reply it could not understand.');
      return body.message;
    },
  };
}

function isAssistant(value: unknown): value is Extract<ChatMessage, { role: 'assistant' }> {
  const message = value as { role?: unknown; content?: unknown; tool_calls?: unknown } | null;
  return message?.role === 'assistant'
    && (typeof message.content === 'string' || message.content === null)
    && (message.tool_calls === undefined || Array.isArray(message.tool_calls));
}
