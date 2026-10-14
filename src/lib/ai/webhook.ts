import { createHmac } from "crypto";
import { getServerConfig } from "../config";
import { AppError } from "../errors";
import { assertSafeExternalUrl } from "../security/ssrf";

const MAX_RESPONSE_BYTES = 200_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 10_000;

interface RetryableError extends AppError {
  retryAfterMs?: number;
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/**
 * Deterministic HMAC signature over `timestamp.body`, matching the
 * `X-Agent-Signature: sha256=<hex>` header sent to external agents.
 */
export function signAgentPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseFloat(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function toRetryable(error: unknown, retryAfterMs?: number): RetryableError {
  const wrapped: RetryableError =
    error instanceof AppError
      ? (error as RetryableError)
      : new AppError((error as Error).message, 502, "AGENT_UNREACHABLE");
  if (retryAfterMs !== undefined) wrapped.retryAfterMs = retryAfterMs;
  return wrapped;
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === "AGENT_TIMEOUT" || error.code === "AGENT_UNREACHABLE")
  );
}

function backoffDelay(
  attempt: number,
  baseMs: number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, MAX_BACKOFF_MS);
  }
  const exponential = baseMs * 2 ** (attempt - 1);
  const jitter = Math.random() * exponential * 0.25;
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

async function attemptCall(
  url: URL,
  payload: { taskId: string; input: string },
  secret: string | null | undefined,
  timeoutMs: number,
): Promise<unknown> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers["X-Agent-Timestamp"] = timestamp;
    headers["X-Agent-Task-Id"] = payload.taskId;
    headers["X-Agent-Signature"] = signAgentPayload(secret, timestamp, body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "error",
    });

    const text = await response.text();
    const truncated = text.slice(0, MAX_RESPONSE_BYTES);

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      const retryAfterMs = retryable
        ? parseRetryAfter(response.headers.get("retry-after"))
        : undefined;
      throw toRetryable(
        new AppError(
          `External agent returned ${response.status}`,
          502,
          retryable ? "AGENT_UNREACHABLE" : "AGENT_HTTP_ERROR",
        ),
        retryAfterMs,
      );
    }

    try {
      return JSON.parse(truncated);
    } catch {
      return { text: truncated };
    }
  } catch (error) {
    if (isRetryable(error)) throw error;
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("External agent timed out", 504, "AGENT_TIMEOUT");
    }
    throw new AppError(
      `Failed to call external agent: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      502,
      "AGENT_UNREACHABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invoke an external (developer-hosted) agent over HTTPS with HMAC request
 * signing, a strict timeout and bounded exponential-backoff retries.
 *
 * The endpoint is SSRF-validated before every call so a compromised or
 * re-pointed DNS record cannot reach internal services.
 */
export async function callExternalAgent(
  endpoint: string,
  payload: { taskId: string; input: string },
  secret?: string | null,
): Promise<unknown> {
  const config = getServerConfig();
  const timeoutMs = positive(config.EXTERNAL_AGENT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxAttempts = Math.max(
    1,
    Math.floor(positive(config.EXTERNAL_AGENT_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS)),
  );
  const backoffMs = positive(config.EXTERNAL_AGENT_BACKOFF_MS, DEFAULT_BACKOFF_MS);

  const url = await assertSafeExternalUrl(endpoint);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await attemptCall(url, payload, secret, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) throw error;
      const retryAfterMs = (error as RetryableError).retryAfterMs;
      await new Promise((resolve) =>
        setTimeout(resolve, backoffDelay(attempt, backoffMs, retryAfterMs)),
      );
    }
  }
  throw lastError;
}
