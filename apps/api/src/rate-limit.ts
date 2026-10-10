// A sliding-window limit per client, kept in memory. Enough for one server; several servers behind a
// load balancer would share a store (e.g. Redis) instead.

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  allow(client: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(client) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(client, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(client, recent);
    return true;
  }
}
