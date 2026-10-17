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
});
