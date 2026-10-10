// The API server. Node's own http module: no framework, and Node runs this TypeScript file directly.
//   GET  /api/health  -> { ok, tutor: configured? }
//   POST /api/tutor   -> one model call for the tutor (see tutor.ts)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { RateLimiter } from './rate-limit.ts';
import { handleTutor, type TutorConfig } from './tutor.ts';
import { handleLearning } from './learning.ts';

const config: TutorConfig = {
  apiKey: process.env.OPENAI_API_KEY || undefined,
  model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  learningModels: {
    'learn-linux': process.env.OPENAI_MODEL_LINUX || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    'learn-docker': process.env.OPENAI_MODEL_DOCKER || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    terminal: process.env.OPENAI_MODEL_TERMINAL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    'chmod-arcade': process.env.OPENAI_MODEL_CHMOD_ARCADE || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  },
};
const port = Number(process.env.PORT || 8787);
const MAX_BODY_BYTES = 512 * 1024;
const limiter = new RateLimiter(Number(process.env.TUTOR_REQUESTS_PER_MINUTE || 30), 60_000);

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    console.error(error);
    send(response, 500, { error: 'Something went wrong on the server.' });
  }
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return send(response, 200, { ok: true, tutor: config.apiKey ? 'configured' : 'missing OPENAI_API_KEY' });
  }
  if (request.method === 'POST' && url.pathname === '/api/tutor') {
    if (!limiter.allow(request.socket.remoteAddress ?? 'unknown')) {
      return send(response, 429, { error: 'Slow down a little: too many questions in a minute.' });
    }
    const body = await readJson(request);
    if (body === undefined) return send(response, 400, { error: 'The request body must be JSON under 512 KB.' });
    const reply = await handleTutor(body, config);
    return send(response, reply.status, reply.body);
  }
  if (request.method === 'POST' && /^\/api\/learning\/(plan|evaluate|hint|answer)$/.test(url.pathname)) {
    if (!limiter.allow(request.socket.remoteAddress ?? 'unknown')) {
      return send(response, 429, { error: 'Slow down a little: too many learning requests in a minute.' });
    }
    const body = await readJson(request);
    if (body === undefined) return send(response, 400, { error: 'The request body must be JSON under 512 KB.' });
    const operation = url.pathname.slice('/api/learning/'.length);
    const reply = await handleLearning({ ...(body as Record<string, unknown>), operation }, config);
    return send(response, reply.status, reply.body);
  }
  send(response, 404, { error: 'Not found.' });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

server.listen(port, () => {
  const tutor = config.apiKey ? 'on' : 'off';
  console.log(`tuxos API on http://localhost:${port} (model ${config.model}, tutor ${tutor})`);
});
