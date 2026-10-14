import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  EXTERNAL_AGENT_TIMEOUT_MS: 1000,
  EXTERNAL_AGENT_MAX_ATTEMPTS: 3,
  EXTERNAL_AGENT_BACKOFF_MS: 1,
}));

vi.mock("@/lib/config", () => ({
  getServerConfig: () => config,
  isProductionRuntime: () => false,
}));

import { callExternalAgent, signAgentPayload } from "@/lib/ai/webhook";

const ENDPOINT = "https://93.184.216.34/hook";
const INPUT = { taskId: "task_1", input: "hello" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  config.EXTERNAL_AGENT_TIMEOUT_MS = 1000;
  config.EXTERNAL_AGENT_MAX_ATTEMPTS = 3;
  config.EXTERNAL_AGENT_BACKOFF_MS = 1;
});

describe("agent payload signing", () => {
  it("is deterministic and prefixed", () => {
    const a = signAgentPayload("secret", "1700000000", "{}");
    const b = signAgentPayload("secret", "1700000000", "{}");
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signAgentPayload("other", "1700000000", "{}")).not.toBe(a);
  });
});

describe("callExternalAgent", () => {
  it("retries transient 5xx errors and signs the request", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "busy" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { output: "done" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callExternalAgent(ENDPOINT, INPUT, "shh");
    expect(result).toEqual({ output: "done" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const init = calls[1][1];
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    expect(headers["X-Agent-Signature"]).toBe(
      signAgentPayload("shh", headers["X-Agent-Timestamp"], body),
    );
    expect(headers["X-Agent-Task-Id"]).toBe("task_1");
  });

  it("does not retry client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: "bad" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callExternalAgent(ENDPOINT, INPUT)).rejects.toMatchObject({
      code: "AGENT_HTTP_ERROR",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out slow endpoints", async () => {
    config.EXTERNAL_AGENT_MAX_ATTEMPTS = 1;
    config.EXTERNAL_AGENT_TIMEOUT_MS = 20;
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(callExternalAgent(ENDPOINT, INPUT)).rejects.toMatchObject({
      code: "AGENT_TIMEOUT",
    });
  });

  it("blocks SSRF endpoints before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callExternalAgent("http://169.254.169.254/latest/meta-data", INPUT),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
