import { ConfigurationError, AppError } from "../errors";
import { getServerConfig } from "../config";

export type LlmMode = "live" | "demo";

export function getLlmMode(): LlmMode | null {
  const config = getServerConfig();
  if (config.hasLlm) return "live";
  if (config.ENABLE_DEMO_MODE) return "demo";
  return null;
}

export function assertLlmAvailable(): LlmMode {
  const mode = getLlmMode();
  if (!mode) {
    throw new ConfigurationError(
      "No LLM provider is configured. Set LLM_API_KEY (and optionally LLM_BASE_URL, LLM_MODEL) on the server, or enable ENABLE_DEMO_MODE=true for clearly-labelled demo responses.",
    );
  }
  return mode;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

async function callChatCompletions(
  messages: ChatMessage[],
  options: { maxTokens: number; timeoutMs: number; json: boolean },
): Promise<string> {
  const config = getServerConfig();
  if (!config.LLM_API_KEY) {
    throw new ConfigurationError("LLM_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${config.LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.LLM_MODEL,
        messages,
        max_tokens: options.maxTokens,
        temperature: 0.2,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AppError(
        `LLM provider returned ${response.status}. ${detail.slice(0, 200)}`,
        502,
        "LLM_ERROR",
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError(
        "LLM provider returned an empty response",
        502,
        "LLM_EMPTY",
      );
    }
    return content;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("LLM request timed out", 504, "LLM_TIMEOUT");
    }
    throw new AppError(
      `Failed to reach LLM provider: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      502,
      "LLM_UNREACHABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new AppError(
      "LLM response was not valid JSON",
      502,
      "LLM_BAD_FORMAT",
    );
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AppError(
      "LLM response could not be parsed as JSON",
      502,
      "LLM_BAD_FORMAT",
    );
  }
}

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  schemaHint: string;
  demo: () => T;
  parse: (raw: unknown) => T;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface StructuredResponse<T> {
  data: T;
  mode: LlmMode;
  model: string | null;
}

export async function runStructured<T>(
  request: StructuredRequest<T>,
): Promise<StructuredResponse<T>> {
  const mode = assertLlmAvailable();
  if (mode === "demo") {
    return { data: request.demo(), mode: "demo", model: null };
  }

  const config = getServerConfig();
  const raw = await callChatCompletions(
    [
      { role: "system", content: request.system },
      {
        role: "user",
        content: `${request.prompt}\n\nRespond with JSON matching this shape:\n${request.schemaHint}`,
      },
    ],
    {
      maxTokens: request.maxTokens ?? 1200,
      timeoutMs: request.timeoutMs ?? 30_000,
      json: true,
    },
  );

  return { data: request.parse(extractJson(raw)), mode: "live", model: config.LLM_MODEL };
}
