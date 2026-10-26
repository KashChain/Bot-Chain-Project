import { describe, expect, it } from "vitest";
import { getRepository } from "@/lib/repo";

const EXACT_QUERY = "Research the latest developments in blockchain technology";

describe("explore search", () => {
  it("matches the reported query across seeded agents", async () => {
    const repo = getRepository();
    const page = await repo.listAgentsPage({
      search: EXACT_QUERY,
      activeOnly: true,
    });
    expect(page.total).toBeGreaterThan(0);
    expect(page.agents.length).toBeGreaterThan(0);
  });

  it("is case-insensitive and supports partial terms", async () => {
    const repo = getRepository();
    const page = await repo.listAgentsPage({
      search: "research latest blockchain",
      activeOnly: true,
    });
    expect(page.total).toBeGreaterThan(0);
  });

  it("preserves category filter with search", async () => {
    const repo = getRepository();
    const researchPage = await repo.listAgentsPage({
      search: "research",
      category: "Research",
      activeOnly: true,
    });
    expect(researchPage.total).toBeGreaterThan(0);
    for (const agent of researchPage.agents) {
      expect(agent.category).toBe("Research");
    }

    const noMatch = await repo.listAgentsPage({
      search: "research",
      category: "Unrelated",
      activeOnly: true,
    });
    expect(noMatch.total).toBe(0);
  });

  it("correctly surfaces new specialized agents by category filter", async () => {
    const repo = getRepository();

    // Research category should include AI Research Assistant and DAO Research Agent
    const researchPage = await repo.listAgentsPage({
      category: "Research",
      activeOnly: true,
    });
    expect(researchPage.total).toBeGreaterThanOrEqual(2);
    const researchSlugs = researchPage.agents.map((a) => a.slug);
    expect(researchSlugs).toContain("ai-research-assistant");
    expect(researchSlugs).toContain("dao-research-agent");

    // Blockchain Analytics category should include all 3 analytics agents
    const analyticsPage = await repo.listAgentsPage({
      category: "Blockchain Analytics",
      activeOnly: true,
    });
    expect(analyticsPage.total).toBeGreaterThanOrEqual(3);
    const analyticsSlugs = analyticsPage.agents.map((a) => a.slug);
    expect(analyticsSlugs).toContain("blockchain-activity-analyst");
    expect(analyticsSlugs).toContain("smart-contract-analysis-agent");
    expect(analyticsSlugs).toContain("on-chain-intelligence-agent");
  });

  it("correctly surfaces new agents when searching by capabilities", async () => {
    const repo = getRepository();

    // 1. Search 'governance' -> DAO Research Agent
    const govPage = await repo.listAgentsPage({
      search: "governance",
      activeOnly: true,
    });
    expect(govPage.total).toBeGreaterThan(0);
    const govSlugs = govPage.agents.map((a) => a.slug);
    expect(govSlugs).toContain("dao-research-agent");

    // 2. Search 'vulnerability' -> Smart Contract Analysis Agent
    const vulnPage = await repo.listAgentsPage({
      search: "vulnerability",
      activeOnly: true,
    });
    expect(vulnPage.total).toBeGreaterThan(0);
    const vulnSlugs = vulnPage.agents.map((a) => a.slug);
    expect(vulnSlugs).toContain("smart-contract-analysis-agent");

    // 3. Search 'liquidity' -> On-Chain Intelligence Agent
    const liqPage = await repo.listAgentsPage({
      search: "liquidity",
      activeOnly: true,
    });
    expect(liqPage.total).toBeGreaterThan(0);
    const liqSlugs = liqPage.agents.map((a) => a.slug);
    expect(liqSlugs).toContain("on-chain-intelligence-agent");
  });

  it("surfaces relevant agents with specific multi-word search queries", async () => {
    const repo = getRepository();

    const daoQuery = await repo.listAgentsPage({
      search: "DAO voting proposal treasury",
      activeOnly: true,
    });
    expect(daoQuery.agents[0]?.slug).toBe("dao-research-agent");

    const scQuery = await repo.listAgentsPage({
      search: "decompilation security bytecode audit",
      activeOnly: true,
    });
    expect(scQuery.agents[0]?.slug).toBe("smart-contract-analysis-agent");

    const whaleQuery = await repo.listAgentsPage({
      search: "whale tracking volume surveillance",
      activeOnly: true,
    });
    expect(whaleQuery.agents[0]?.slug).toBe("on-chain-intelligence-agent");
  });
});
