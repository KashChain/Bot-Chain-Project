import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(),
  isPaymentRecipientConfigured: vi.fn(() => false),
}));

import { getServerConfig } from "@/lib/config";
import { getLlmMode, runStructured } from "@/lib/ai/llm";

const cfg = vi.mocked(getServerConfig);

type FakeConfig = ReturnType<typeof getServerConfig>;

function fakeConfig(overrides: Partial<FakeConfig> = {}): FakeConfig {
  return {
    hasLlm: false,
    ENABLE_DEMO_MODE: true,
    LLM_API_KEY: undefined,
    LLM_BASE_URL: "https://llm.test/v1",
    LLM_MODEL: "test-model",
    ...overrides,
  } as unknown as FakeConfig;
}

const request = {
  system: "system",
  prompt: "prompt",
  schemaHint: '{"answer": string}',
  demo: () => ({ answer: "demo" }),
  parse: (raw: unknown) => ({ answer: String((raw as { answer: unknown }).answer) }),
};

beforeEach(() => {
  cfg.mockReset();
});

describe("getLlmMode", () => {
  it("is live when an API key is present", () => {
    cfg.mockReturnValue(fakeConfig({ hasLlm: true }));
    expect(getLlmMode()).toBe("live");
  });

  it("is demo when no key but demo mode is enabled", () => {
    cfg.mockReturnValue(fakeConfig({ hasLlm: false, ENABLE_DEMO_MODE: true }));
    expect(getLlmMode()).toBe("demo");
  });

  it("is null when neither is available", () => {
    cfg.mockReturnValue(fakeConfig({ hasLlm: false, ENABLE_DEMO_MODE: false }));
    expect(getLlmMode()).toBeNull();
  });
});

describe("runStructured", () => {
  it("returns labelled demo output without calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    cfg.mockReturnValue(fakeConfig({ hasLlm: false, ENABLE_DEMO_MODE: true }));

    const result = await runStructured(request);

    expect(result.mode).toBe("demo");
    expect(result.model).toBeNull();
    expect(result.data).toEqual({ answer: "demo" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a clear configuration error when no provider is available", async () => {
    cfg.mockReturnValue(fakeConfig({ hasLlm: false, ENABLE_DEMO_MODE: false }));
    await expect(runStructured(request)).rejects.toThrow(/No LLM provider is configured/);
  });

  it("parses live provider output and never exposes the key to the client", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"answer":"live"}' } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    cfg.mockReturnValue(
      fakeConfig({ hasLlm: true, LLM_API_KEY: "secret-key", ENABLE_DEMO_MODE: false }),
    );

    const result = await runStructured(request);

    expect(result.mode).toBe("live");
    expect(result.model).toBe("test-model");
    expect(result.data).toEqual({ answer: "live" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/chat/completions");
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe("Bearer secret-key");
  });

  it("maps provider failures to a 502 LLM_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
      }),
    );
    cfg.mockReturnValue(
      fakeConfig({ hasLlm: true, LLM_API_KEY: "k", ENABLE_DEMO_MODE: false }),
    );

    await expect(runStructured(request)).rejects.toMatchObject({
      status: 502,
      code: "LLM_ERROR",
    });
  });
});
