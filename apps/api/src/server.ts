// The API server. Node's own http module: no framework, and Node runs this TypeScript file directly.
//   GET  /api/health  -> { ok, tutor: configured? }
//   POST /api/tutor   -> one model call for the tutor (see tutor.ts)
//   /api/auth/*, /api/save -> accounts and saved progress (see accounts.ts)

import { chmodSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Accounts, MAX_SAVE_BYTES } from './accounts.ts';
import { RateLimiter } from './rate-limit.ts';
import { handleTutor, type TutorConfig } from './tutor.ts';
import { handleLearning } from './learning.ts';

const config: TutorConfig = {
  apiKey: process.env.OPENAI_API_KEY || undefined,
  model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  learningModels: {
    'learn-linux': process.env.OPENAI_MODEL_LINUX || 'gpt-5.6-luna',
    'learn-docker': process.env.OPENAI_MODEL_DOCKER || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    terminal: process.env.OPENAI_MODEL_TERMINAL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    'chmod-arcade': process.env.OPENAI_MODEL_CHMOD_ARCADE || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  },
};
const port = Number(process.env.PORT || 8787);
const MAX_BODY_BYTES = 512 * 1024;
const limiter = new RateLimiter(Number(process.env.TUTOR_REQUESTS_PER_MINUTE || 30), 60_000);
// Guessing passwords: a handful of sign-in attempts per minute per visitor is plenty for a person.
const authLimiter = new RateLimiter(Number(process.env.AUTH_ATTEMPTS_PER_MINUTE || 10), 60_000);
// Accounts live in SQLite. COOKIE_SECURE=0 only for plain-http setups other than localhost.
const accounts = new Accounts(process.env.DATABASE_PATH || 'data/tuxos.db', process.env.COOKIE_SECURE !== '0');
// Behind a reverse proxy (Caddy, then Cloudflare) every request comes from the proxy, so the rate limit
// would be shared by everyone. Only then trust the proxy's header naming the real visitor.
const trustProxy = process.env.TRUST_PROXY === '1';
const host = process.env.HOST || undefined;
// In production the API listens on a Unix socket that only the web server (Caddy, in Docker) can reach.
const socket = process.env.SOCKET || undefined;

/** The visitor's address: Cloudflare's or the proxy's header when trusted, else the socket's. */
function clientAddress(request: IncomingMessage): string {
  if (trustProxy) {
    const header = request.headers['cf-connecting-ip'] ?? request.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

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
    if (!limiter.allow(clientAddress(request))) {
      return send(response, 429, { error: 'Slow down a little: too many questions in a minute.' });
    }
    const body = await readJson(request);
    if (body === undefined) return send(response, 400, { error: 'The request body must be JSON under 512 KB.' });
    const reply = await handleTutor(body, config);
    return send(response, reply.status, reply.body);
  }
  if (request.method === 'POST' && /^\/api\/learning\/(plan|evaluate|hint|answer)$/.test(url.pathname)) {
    if (!limiter.allow(clientAddress(request))) {
      return send(response, 429, { error: 'Slow down a little: too many learning requests in a minute.' });
    }
    const body = await readJson(request);
    if (body === undefined) return send(response, 400, { error: 'The request body must be JSON under 512 KB.' });
    const operation = url.pathname.slice('/api/learning/'.length);
    const reply = await handleLearning({ ...(body as Record<string, unknown>), operation }, config);
    return send(response, reply.status, reply.body);
  }
  if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/save') {
    const guarded = request.method === 'POST' && /^\/api\/auth\/(login|register|verify)$/.test(url.pathname);
    if (guarded && !authLimiter.allow(clientAddress(request))) {
      return send(response, 429, { error: 'Too many attempts. Wait a minute and try again.' });
    }
    // The session is a cookie, so refuse cross-site form posts: those can't send a JSON content type.
    if (request.method !== 'GET' && !request.headers['content-type']?.startsWith('application/json')) {
      return send(response, 415, { error: 'Send JSON.' });
    }
    const limit = url.pathname === '/api/save' ? MAX_SAVE_BYTES * 2 : MAX_BODY_BYTES;
    const body = request.method === 'GET' ? null : await readJson(request, limit);
    if (body === undefined) return send(response, 400, { error: 'The request body must be valid JSON.' });
    const reply = await accounts.handle(request.method ?? 'GET', url.pathname, body, request.headers.cookie);
    return send(response, reply.status, reply.body, reply.cookie);
  }
  send(response, 404, { error: 'Not found.' });
}

async function readJson(request: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) return undefined;
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

function send(response: ServerResponse, status: number, body: unknown, cookie?: string): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  });
  response.end(JSON.stringify(body));
}

const tutorState = config.apiKey ? 'on' : 'off';
if (socket) {
  // A socket file left behind by a crash would stop the server from starting.
  rmSync(socket, { force: true });
  server.listen(socket, () => {
    // The web server runs as a different user, so it must be allowed to connect.
    chmodSync(socket, 0o666);
    console.log(`tuxos API on ${socket} (model ${config.model}, tutor ${tutorState})`);
  });
} else {
  server.listen(port, host, () => {
    console.log(`tuxos API on http://${host ?? 'localhost'}:${port} (model ${config.model}, tutor ${tutorState})`);
  });
}
