import { getServerConfig } from "./config";
import { RateLimitError } from "./errors";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string): void {
  const { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS } = getServerConfig();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${Math.ceil(
        (bucket.resetAt - now) / 1000,
      )}s.`,
    );
  }

  bucket.count += 1;
}

export function rateLimitKey(prefix: string, identifier: string): string {
  return `${prefix}:${identifier}`;
}

/**
 * Sliding-window rate limiting backed by a pluggable store.
 *
 * The default store keeps timestamps in-process, which is enough for a single
 * Node instance (and for testnet traffic). For horizontally-scaled
 * deployments, install a shared store (e.g. Upstash Redis) with
 * {@link setRateLimitStore} so all instances observe the same counters.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<number>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async hit(key: string, windowMs: number, now: number): Promise<number> {
    const cutoff = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.every((ts) => ts <= cutoff)) this.hits.delete(k);
      }
    }
    return recent.length;
  }
}

let rateLimitStore: RateLimitStore = new MemoryRateLimitStore();

export function setRateLimitStore(store: RateLimitStore): void {
  rateLimitStore = store;
}

export function resetRateLimitStore(): void {
  rateLimitStore = new MemoryRateLimitStore();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindow = Math.max(1, Math.floor(windowMs));
  const now = Date.now();
  const count = await rateLimitStore.hit(key, safeWindow, now);
  const allowed = count <= safeLimit;
  const retryAfterSeconds = allowed ? 0 : Math.ceil(safeWindow / 1000);
  return {
    allowed,
    remaining: Math.max(0, safeLimit - count),
    limit: safeLimit,
    retryAfterSeconds,
  };
}
