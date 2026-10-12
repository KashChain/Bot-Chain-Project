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
