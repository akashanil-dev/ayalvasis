// Accounts: a username and password, and the learner's saved TuxOS (the same snapshot the browser keeps for
// guests). Stored in SQLite with Node's built-in driver, so the API still has no dependencies.
//   POST /api/auth/register {username, password}  -> creates the account and signs in
//   POST /api/auth/login    {username, password}  -> signs in
//   POST /api/auth/logout                         -> signs out
//   GET  /api/auth/me                             -> {username} of the signed-in account
//   POST /api/auth/verify   {password}            -> checks the signed-in account's password (Vasi's sudo)
//   GET  /api/save                                -> {data, version}
//   PUT  /api/save          {data, version}       -> saves if version matches, else 409 (changed elsewhere)
// It also keeps each account's own OpenAI API key, sealed by ai-keys.ts (the routes are in server.ts).
// Passwords are kept only as salted scrypt hashes; sessions are random tokens in an HttpOnly cookie, and
// only a hash of each token is stored.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface AccountReply {
  status: number;
  body: unknown;
  /** A Set-Cookie header value, when signing in or out. */
  cookie?: string;
}

/** The same rule the TuxOS kernel uses for Linux usernames, so the account name is the learner's login. */
const USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const MAX_PASSWORD = 1024;
/** A saved system is a JSON snapshot of the learner's files and progress. */
export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
const SESSION_DAYS = 30;
const COOKIE = 'tuxos_session';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (error, key) => {
      if (error) reject(error);
      else resolve(`scrypt$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = (await hashPassword(password, Buffer.from(salt, 'base64'))).split('$')[2]!;
  const a = Buffer.from(candidate, 'base64');
  const b = Buffer.from(hash, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class Accounts {
  private readonly db: DatabaseSync;
  /** Spent on wrong usernames too, so a reply's timing doesn't reveal which usernames exist. */
  private readonly decoy: Promise<string>;
  private readonly secureCookie: boolean;
  private readonly now: () => number;

  // Plain fields, not constructor parameter properties: Node runs this file by stripping types, which
  // doesn't support them.
  constructor(path: string, secureCookie = true, now = () => Date.now()) {
    this.secureCookie = secureCookie;
    this.now = now;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saves (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_keys (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sealed TEXT NOT NULL,
        hint TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this.decoy = hashPassword('decoy');
  }

  close(): void {
    this.db.close();
  }

  async handle(method: string, path: string, body: unknown, cookieHeader: string | undefined): Promise<AccountReply> {
    const user = this.sessionUser(cookieHeader);
    switch (`${method} ${path}`) {
      case 'POST /api/auth/register': return this.register(body);
      case 'POST /api/auth/login': return this.login(body);
      case 'POST /api/auth/logout': return this.logout(cookieHeader);
      case 'GET /api/auth/me':
        return user ? { status: 200, body: { username: user.username } } : notSignedIn();
      case 'POST /api/auth/verify': {
        if (!user) return notSignedIn();
        const password = (body as { password?: unknown } | null)?.password;
        const ok = typeof password === 'string' && await passwordMatches(password, user.password_hash);
        return ok ? { status: 200, body: { ok: true } } : { status: 403, body: { error: 'Sorry, try again.' } };
      }
      case 'GET /api/save': {
        if (!user) return notSignedIn();
        const save = this.db.prepare('SELECT data, version FROM saves WHERE user_id = ?').get(user.id) as
          { data: string; version: number } | undefined;
        return { status: 200, body: save ?? { data: null, version: 0 } };
      }
      case 'PUT /api/save': return user ? this.save(user.id, body) : notSignedIn();
      default: return { status: 404, body: { error: 'Not found.' } };
    }
  }

  private async register(body: unknown): Promise<AccountReply> {
    const { username, password } = credentials(body);
    if (!username || !USERNAME.test(username) || username === 'root') {
      return { status: 400, body: { error: 'Usernames are lowercase letters, digits, - and _, starting with a letter.' } };
    }
    if (!password) return { status: 400, body: { error: 'Choose a password.' } };
    if (password.length > MAX_PASSWORD) return { status: 400, body: { error: 'That password is too long.' } };
    const hash = await hashPassword(password);
    try {
      const created = this.db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
        .run(username, hash, this.now());
      return this.signIn(Number(created.lastInsertRowid), username, 201);
    } catch (error) {
      if (String(error).includes('UNIQUE')) return { status: 409, body: { error: 'That username is taken.' } };
      throw error;
    }
  }

  private async login(body: unknown): Promise<AccountReply> {
    const { username, password } = credentials(body);
    const user = username
      ? this.db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as
        { id: number; username: string; password_hash: string } | undefined
      : undefined;
    const usable = password !== undefined && password.length <= MAX_PASSWORD;
    let ok = false;
    if (user && usable) ok = await passwordMatches(password, user.password_hash);
    else await passwordMatches(usable ? password : '', await this.decoy);
    if (!user || !ok) return { status: 401, body: { error: 'Wrong username or password.' } };
    return this.signIn(user.id, user.username, 200);
  }

  private logout(cookieHeader: string | undefined): AccountReply {
    const token = readCookie(cookieHeader);
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return { status: 200, body: { ok: true }, cookie: this.cookie('', 0) };
  }

  private save(userId: number, body: unknown): AccountReply {
    const { data, version } = (body ?? {}) as { data?: unknown; version?: unknown };
    if (typeof data !== 'string' || typeof version !== 'number' || !Number.isInteger(version)) {
      return { status: 400, body: { error: 'Expected { data, version }.' } };
    }
    if (Buffer.byteLength(data) > MAX_SAVE_BYTES) return { status: 413, body: { error: 'This save is too large.' } };
    const current = (this.db.prepare('SELECT version FROM saves WHERE user_id = ?').get(userId) as
      { version: number } | undefined)?.version ?? 0;
    // Another tab or device saved since this one loaded: refuse rather than overwrite newer progress.
    if (version !== current) {
      return { status: 409, body: { error: 'Your progress was saved from somewhere else. Reload to continue.', version: current } };
    }
    const next = current + 1;
    this.db.prepare(`INSERT INTO saves (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at`)
      .run(userId, data, next, this.now());
    return { status: 200, body: { version: next } };
  }

  /** The signed-in account, if the cookie belongs to a live session. */
  user(cookieHeader: string | undefined): { id: number; username: string } | undefined {
    const user = this.sessionUser(cookieHeader);
    return user && { id: user.id, username: user.username };
  }

  /** The account's sealed OpenAI key and its hint, if it saved one. */
  aiKey(userId: number): { sealed: string; hint: string } | undefined {
    return this.db.prepare('SELECT sealed, hint FROM ai_keys WHERE user_id = ?').get(userId) as
      { sealed: string; hint: string } | undefined;
  }

  setAiKey(userId: number, sealed: string, hint: string): void {
    this.db.prepare(`INSERT INTO ai_keys (user_id, sealed, hint, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET sealed = excluded.sealed, hint = excluded.hint, updated_at = excluded.updated_at`)
      .run(userId, sealed, hint, this.now());
  }

  removeAiKey(userId: number): void {
    this.db.prepare('DELETE FROM ai_keys WHERE user_id = ?').run(userId);
  }

  private signIn(userId: number, username: string, status: number): AccountReply {
    const token = randomBytes(32).toString('base64url');
    const expires = this.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(this.now());
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, expires);
    return { status, body: { username }, cookie: this.cookie(token, SESSION_DAYS * 24 * 60 * 60) };
  }

  private sessionUser(cookieHeader: string | undefined) {
    const token = readCookie(cookieHeader);
    if (!token) return undefined;
    return this.db.prepare(`SELECT users.id, users.username, users.password_hash FROM sessions
      JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(tokenHash(token), this.now()) as { id: number; username: string; password_hash: string } | undefined;
  }

  private cookie(value: string, maxAge: number): string {
    return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secureCookie ? '; Secure' : ''}`;
  }
}

function credentials(body: unknown): { username?: string; password?: string } {
  const value = (body ?? {}) as { username?: unknown; password?: unknown };
  return {
    username: typeof value.username === 'string' ? value.username : undefined,
    password: typeof value.password === 'string' ? value.password : undefined,
  };
}

function readCookie(header: string | undefined): string | undefined {
  return header?.split(';').map((part) => part.trim().split('='))
    .find(([name]) => name === COOKIE)?.slice(1).join('=') || undefined;
}

const notSignedIn = (): AccountReply => ({ status: 401, body: { error: 'Not signed in.' } });
