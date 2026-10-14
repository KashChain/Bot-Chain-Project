import { describe, expect, it } from "vitest";
import { getMemoryRepository } from "@/lib/repo/memory";
import { ConflictError } from "@/lib/errors";

const owner = "0x4444444444444444444444444444444444444444";

function newAgent(slug: string) {
  return {
    slug,
    name: `Agent ${slug}`,
    description: "Description for the review repository test agent long enough.",
    category: "Research",
    capabilities: ["One"],
    usageInstructions: "Give a detailed task description here.",
    endpoint: "https://example.com/agent",
    priceWei: "10000000000000000",
    ownerAddress: owner,
  };
}

async function completedTask(agentId: string) {
  const repo = getMemoryRepository();
  const task = await repo.createTask({
    agentId,
    clientAddress: owner,
    input: "please do the thing",
    inputHash: "0xdef",
    priceWei: "10000000000000000",
  });
  return repo.updateTask(task.id, { status: "COMPLETED" });
}

describe("reviews (memory repository)", () => {
  it("records a review and updates agent aggregates", async () => {
    const repo = getMemoryRepository();
    const agent = await repo.createAgent(newAgent(`rev-${Date.now()}`));
    const task = await completedTask(agent.id);

    const review = await repo.createReview({
      taskId: task.id,
      agentId: agent.id,
      reviewerAddress: owner,
      rating: 5,
      comment: "Excellent work",
    });
    expect(review.rating).toBe(5);

    const reviews = await repo.listReviewsByAgent(agent.id);
    expect(reviews).toHaveLength(1);

    const refreshed = await repo.getAgentById(agent.id);
    expect(refreshed?.ratingCount).toBe(1);
    expect(refreshed?.ratingAverage).toBe(5);
    expect(refreshed?.completedTaskCount).toBe(1);

    expect(await repo.getReviewByTask(task.id)).not.toBeNull();
  });

  it("prevents duplicate reviews for the same task", async () => {
    const repo = getMemoryRepository();
    const agent = await repo.createAgent(newAgent(`rev-dup-${Date.now()}`));
    const task = await completedTask(agent.id);

    await repo.createReview({
      taskId: task.id,
      agentId: agent.id,
      reviewerAddress: owner,
      rating: 4,
    });
    await expect(
      repo.createReview({
        taskId: task.id,
        agentId: agent.id,
        reviewerAddress: owner,
        rating: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("sorts agents by rating", async () => {
    const repo = getMemoryRepository();
    const stamp = Date.now();
    const high = await repo.createAgent(newAgent(`rev-high-${stamp}`));
    const low = await repo.createAgent(newAgent(`rev-low-${stamp}`));

    const highTask = await completedTask(high.id);
    const lowTask = await completedTask(low.id);
    await repo.createReview({
      taskId: highTask.id,
      agentId: high.id,
      reviewerAddress: owner,
      rating: 5,
    });
    await repo.createReview({
      taskId: lowTask.id,
      agentId: low.id,
      reviewerAddress: owner,
      rating: 2,
    });

    const sorted = await repo.listAgents({ sort: "rating", activeOnly: true });
    const highIndex = sorted.findIndex((a) => a.id === high.id);
    const lowIndex = sorted.findIndex((a) => a.id === low.id);
    expect(highIndex).toBeGreaterThanOrEqual(0);
    expect(lowIndex).toBeGreaterThanOrEqual(0);
    expect(highIndex).toBeLessThan(lowIndex);
  });

  it("paginates and counts agents", async () => {
    const repo = getMemoryRepository();
    const all = await repo.countAgents({ activeOnly: true });
    const page = await repo.listAgentsPage({ activeOnly: true, limit: 1, offset: 0 });
    expect(page.total).toBe(all);
    expect(page.agents.length).toBeLessThanOrEqual(1);
  });
});
