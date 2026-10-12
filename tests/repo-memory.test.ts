import { describe, expect, it } from "vitest";
import { getMemoryRepository } from "@/lib/repo/memory";
import { ConflictError } from "@/lib/errors";

const owner = "0x2222222222222222222222222222222222222222";

function newAgent(slug: string) {
  return {
    slug,
    name: `Agent ${slug}`,
    description: "Description for the repository test agent that is long enough.",
    category: "Research",
    capabilities: ["One"],
    usageInstructions: "Give a detailed task description here.",
    endpoint: "https://example.com/agent",
    priceWei: "10000000000000000",
    ownerAddress: owner,
  };
}

describe("memory repository", () => {
  it("seeds the built-in agents", async () => {
    const repo = getMemoryRepository();
    const agents = await repo.listAgents();
    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(agents.some((a) => a.slug === "ai-research-assistant")).toBe(true);
    expect(agents.some((a) => a.slug === "blockchain-activity-analyst")).toBe(
      true,
    );
  });

  it("creates agents and prevents duplicate slugs", async () => {
    const repo = getMemoryRepository();
    const created = await repo.createAgent(newAgent(`dup-${Date.now()}`));
    expect(created.active).toBe(true);
    await expect(repo.createAgent(newAgent(created.slug))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("filters by category and search", async () => {
    const repo = getMemoryRepository();
    const category = `TestCat-${Date.now()}`;
    await repo.createAgent({ ...newAgent(`cat-${Date.now()}`), category });
    const byCategory = await repo.listAgents({ category });
    expect(byCategory.length).toBe(1);
    const bySearch = await repo.listAgents({ search: "repository test agent" });
    expect(bySearch.length).toBeGreaterThan(0);
  });

  it("sorts by price ascending", async () => {
    const repo = getMemoryRepository();
    const agents = await repo.listAgents({ sort: "price-asc" });
    for (let i = 1; i < agents.length; i += 1) {
      expect(BigInt(agents[i].priceWei)).toBeGreaterThanOrEqual(
        BigInt(agents[i - 1].priceWei),
      );
    }
  });

  it("creates and updates tasks, and prevents duplicate payments", async () => {
    const repo = getMemoryRepository();
    const agent = await repo.getAgentBySlug("ai-research-assistant");
    if (!agent) throw new Error("seed agent missing");
    const task = await repo.createTask({
      agentId: agent.id,
      clientAddress: owner,
      input: "hello world",
      inputHash: "0xabc",
      priceWei: agent.priceWei,
    });
    expect(task.status).toBe("CREATED");
    const updated = await repo.updateTask(task.id, { status: "PAYMENT_PENDING" });
    expect(updated.status).toBe("PAYMENT_PENDING");

    await repo.createPayment({
      taskId: task.id,
      txHash: `0x${"a".repeat(64)}`,
      chainId: 968,
      fromAddress: owner,
      toAddress: "0x3333333333333333333333333333333333333333",
      amountWei: agent.priceWei,
      status: "mock",
    });
    await expect(
      repo.createPayment({
        taskId: task.id,
        txHash: `0x${"b".repeat(64)}`,
        chainId: 968,
        fromAddress: owner,
        toAddress: "0x3333333333333333333333333333333333333333",
        amountWei: agent.priceWei,
        status: "mock",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const byClient = await repo.listTasksByClient(owner);
    expect(byClient.some((t) => t.id === task.id)).toBe(true);
  });
});
