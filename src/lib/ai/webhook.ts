import { AppError } from "../errors";
import { assertSafeExternalUrl } from "../security/ssrf";

const MAX_RESPONSE_BYTES = 200_000;

export async function callExternalAgent(
  endpoint: string,
  payload: { taskId: string; input: string },
): Promise<unknown> {
  const url = await assertSafeExternalUrl(endpoint);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: "error",
    });

    const text = await response.text();
    const truncated = text.slice(0, MAX_RESPONSE_BYTES);

    if (!response.ok) {
      throw new AppError(
        `External agent returned ${response.status}`,
        502,
        "AGENT_HTTP_ERROR",
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
