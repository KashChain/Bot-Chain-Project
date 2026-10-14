import { createHmac } from "crypto";
import { AppError } from "../errors";
import { assertSafeExternalUrl } from "../security/ssrf";

const MAX_RESPONSE_BYTES = 200_000;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;

function signPayload(secret: string, timestamp: string, body: string): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

async function attemptCall(
  url: URL,
  payload: { taskId: string; input: string },
  secret?: string | null,
): Promise<unknown> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers["X-Agent-Timestamp"] = timestamp;
    headers["X-Agent-Task-Id"] = payload.taskId;
    headers["X-Agent-Signature"] = signPayload(secret, timestamp, body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      throw new AppError(
        `External agent returned ${response.status}`,
        502,
        retryable ? "AGENT_UNREACHABLE" : "AGENT_HTTP_ERROR",
      );
    }

    try {
      return JSON.parse(truncated);
    } catch {
      return { text: truncated };
    }
  } catch (error) {
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

export async function callExternalAgent(
  endpoint: string,
  payload: { taskId: string; input: string },
  secret?: string | null,
): Promise<unknown> {
  const url = await assertSafeExternalUrl(endpoint);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await attemptCall(url, payload, secret);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof AppError &&
        (error.code === "AGENT_TIMEOUT" || error.code === "AGENT_UNREACHABLE");
      if (!retryable || attempt === MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
