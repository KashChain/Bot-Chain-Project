import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contract")>();
  return {
    ...actual,
    isOnchainReceiptConfigured: vi.fn(() => false),
    syncTaskOnchain: vi.fn(),
  };
});

vi.mock("@/lib/ai/executor", () => ({
  executeAgent: vi.fn(),
}));

import { executeAgent } from "@/lib/ai/executor";
import { getRepository } from "@/lib/repo";
import { lockEscrow } from "@/lib/escrow/service";
import { runTask } from "@/lib/tasks/service";

const executeMock = vi.mocked(executeAgent);
const CLIENT = "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";

async function seedPaidTaskWithEscrow() {
  const repo = getRepository();
  const agent = await repo.getAgentBySlug("ai-research-assistant");
  if (!agent) throw new Error("seed agent missing");
  const created = await repo.createTask({
    agentId: agent.id,
    clientAddress: CLIENT,
    input: "Summarise BOT Chain",
    inputHash: "0xabc",
    priceWei: agent.priceWei,
    currency: "BOT",
  });
  const paid = await repo.updateTask(created.id, { status: "PAID" });
  await lockEscrow(paid);
  return paid;
}

beforeEach(() => {
  executeMock.mockReset();
});

describe("runTask economics", () => {
  it("releases escrow when the task completes", async () => {
    executeMock.mockResolvedValue({
      mode: "demo",
      model: "demo",
      output: { summary: "ok" },
    });
    const task = await seedPaidTaskWithEscrow();
    const { task: done } = await runTask(task.id);
    expect(done.status).toBe("COMPLETED");

    const escrow = await getRepository().getEscrowByTask(task.id);
    expect(escrow?.status).toBe("RELEASED");
  });

  it("refunds escrow when execution fails", async () => {
    executeMock.mockRejectedValue(new Error("model exploded"));
    const task = await seedPaidTaskWithEscrow();

    await expect(runTask(task.id)).rejects.toThrow("model exploded");

    const repo = getRepository();
    const failed = await repo.getTask(task.id);
    expect(failed?.status).toBe("FAILED");
    const escrow = await repo.getEscrowByTask(task.id);
    expect(escrow?.status).toBe("REFUNDED");
  });
});
