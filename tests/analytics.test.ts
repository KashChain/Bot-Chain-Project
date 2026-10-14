import { describe, expect, it } from "vitest";
import { getRepository } from "@/lib/repo";
import { getLeaderboard, getPlatformMetrics } from "@/lib/analytics/service";

const OWNER = "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";
const CLIENT = "0x1111111111111111111111111111111111111111";

async function seedReleasedEscrow(agentId: string, amountWei: string) {
  const repo = getRepository();
  const task = await repo.createTask({
    agentId,
    clientAddress: CLIENT,
    input: "analytics fixture",
    inputHash: "0x" + Math.random().toString(16).slice(2).padEnd(8, "0"),
    priceWei: amountWei,
    currency: "BOT",
  });
  const escrow = await repo.createEscrow({
    taskId: task.id,
    agentId,
    ownerAddress: OWNER,
    clientAddress: CLIENT,
    amountWei,
    feeBps: 250,
    feeWei: ((BigInt(amountWei) * 250n) / 10_000n).toString(),
    netWei: (BigInt(amountWei) - (BigInt(amountWei) * 250n) / 10_000n).toString(),
  });
  await repo.updateEscrow(task.id, { status: "RELEASED", releasedAt: new Date() });
  return escrow;
}

describe("analytics service", () => {
  it("aggregates platform metrics from escrows and tasks", async () => {
    const repo = getRepository();
    const agent = await repo.getAgentBySlug("ai-research-assistant");
    if (!agent) throw new Error("seed agent missing");

    await seedReleasedEscrow(agent.id, "1000000000000000000");
    await seedReleasedEscrow(agent.id, "2000000000000000000");

    const metrics = await getPlatformMetrics(30);
    expect(BigInt(metrics.gmvWei)).toBeGreaterThanOrEqual(3000000000000000000n);
    expect(BigInt(metrics.releasedWei)).toBeGreaterThanOrEqual(2925000000000000000n);
    expect(BigInt(metrics.feesWei)).toBeGreaterThan(0n);
    expect(metrics.totalAgents).toBeGreaterThan(0);
    expect(metrics.activeAgents).toBeGreaterThan(0);
  });

  it("ranks the creator and agent on the leaderboard", async () => {
    const repo = getRepository();
    const agent = await repo.getAgentBySlug("ai-research-assistant");
    if (!agent) throw new Error("seed agent missing");
    await seedReleasedEscrow(agent.id, "5000000000000000000");

    const leaderboard = await getLeaderboard({ limit: 10, windowDays: 30 });
    expect(leaderboard.creators.length).toBeGreaterThan(0);
    const creator = leaderboard.creators.find(
      (entry) => entry.ownerAddress.toLowerCase() === OWNER.toLowerCase(),
    );
    expect(creator).toBeDefined();
    expect(creator?.rank).toBeGreaterThan(0);

    const agentEntry = leaderboard.agents.find((entry) => entry.agentId === agent.id);
    expect(agentEntry).toBeDefined();
    expect(agentEntry?.slug).toBe("ai-research-assistant");
  });
});
