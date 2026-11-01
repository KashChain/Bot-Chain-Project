import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(),
}));

import { getServerConfig } from "@/lib/config";
import { runResearch } from "@/lib/ai/research";
import { executeAgent } from "@/lib/ai/executor";
import type { AgentRecord } from "@/lib/repo/types";

const cfg = vi.mocked(getServerConfig);

type FakeConfig = ReturnType<typeof getServerConfig>;

function liveConfig(): FakeConfig {
  return {
    hasLlm: true,
    LLM_API_KEY: "test-key",
    LLM_BASE_URL: "https://llm.test/v1",
    LLM_MODEL: "test-model",
    ENABLE_DEMO_MODE: false,
  } as unknown as FakeConfig;
}

function fetchReturning(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

beforeEach(() => {
  cfg.mockReset();
  vi.unstubAllGlobals();
});

describe("research agent execution", () => {
  it("parses structured research with sources and sends the real question", async () => {
    const fetchMock = fetchReturning(
      JSON.stringify({
        summary: "Proposal 42 diversifies treasury exposure.",
        findings: ["Quorum reached", "Two voters hold 40%"],
        caveats: ["Vote still open"],
        sources: [{ title: "Governance forum", url: "https://example.com/p42" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    cfg.mockReturnValue(liveConfig());

    const { result, mode, model } = await runResearch(
      "Analyse Proposal #42 on treasury diversification",
    );

    expect(mode).toBe("live");
    expect(model).toBe("test-model");
    expect(result.question).toBe(
      "Analyse Proposal #42 on treasury diversification",
    );
    expect(result.sources).toEqual([
      { title: "Governance forum", url: "https://example.com/p42" },
    ]);

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.messages[1].content).toContain(
      "Analyse Proposal #42 on treasury diversification",
    );
  });

  it("returns clearly labelled demo output when no provider is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    cfg.mockReturnValue({
      hasLlm: false,
      ENABLE_DEMO_MODE: true,
      LLM_API_KEY: undefined,
      LLM_BASE_URL: "https://llm.test/v1",
      LLM_MODEL: "test-model",
    } as unknown as FakeConfig);

    const { result, mode, model } = await runResearch("What is BOT Chain?");

    expect(mode).toBe("demo");
    expect(model).toBeNull();
    expect(result.summary).toContain("[DEMO MODE]");
    expect(result.findings[0]).toContain("[DEMO]");
    expect(result.sources).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the DAO task prompt and DAO guidance to the provider", async () => {
    const fetchMock = fetchReturning(
      JSON.stringify({
        summary: "Summary",
        findings: ["Finding"],
        caveats: [],
        sources: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    cfg.mockReturnValue(liveConfig());

    const agent = {
      slug: "dao-research-agent",
      name: "DAO Research Agent",
    } as unknown as AgentRecord;

    const outcome = await executeAgent(
      agent,
      "task-1",
      "Analyse Proposal #42 treasury diversification",
    );

    expect((outcome.output as { question: string }).question).toBe(
      "Analyse Proposal #42 treasury diversification",
    );
    expect(outcome.mode).toBe("live");

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.messages[0].content).toContain("DAO governance research specialist");
    expect(body.messages[1].content).toContain(
      "Analyse Proposal #42 treasury diversification",
    );
  });
});
