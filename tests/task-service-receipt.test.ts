import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contract")>();
  return {
    ...actual,
    isOnchainReceiptConfigured: vi.fn(() => true),
    syncTaskOnchain: vi.fn(),
  };
});

vi.mock("@/lib/ai/executor", () => ({
  executeAgent: vi.fn(),
}));

import { executeAgent } from "@/lib/ai/executor";
import { isOnchainReceiptConfigured, syncTaskOnchain } from "@/lib/contract";
import { getRepository } from "@/lib/repo";
import { runTask, syncTaskReceipt } from "@/lib/tasks/service";

const executeAgentMock = vi.mocked(executeAgent);
const syncMock = vi.mocked(syncTaskOnchain);
const configuredMock = vi.mocked(isOnchainReceiptConfigured);

async function seedPaidTask() {
  const repo = getRepository();
  const agent = await repo.getAgentBySlug("ai-research-assistant");
  if (!agent) throw new Error("seed agent missing");
  const task = await repo.createTask({
    agentId: agent.id,
    clientAddress: "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942",
    input: "Summarise BOT Chain",
    inputHash: "0xabc",
    priceWei: agent.priceWei,
    currency: "BOT",
  });
  return repo.updateTask(task.id, { status: "PAID" });
}

beforeEach(() => {
  executeAgentMock.mockReset();
  syncMock.mockReset();
  configuredMock.mockReset();
  configuredMock.mockReturnValue(true);
  executeAgentMock.mockResolvedValue({
    mode: "demo",
    model: "demo",
    output: { summary: "ok" },
  });
});

describe("runTask receipt separation", () => {
  it("keeps the task COMPLETED when the on-chain receipt fails", async () => {
    const paid = await seedPaidTask();
    syncMock.mockResolvedValue({
      attempted: true,
      txHashes: [],
      confirmed: false,
      error: "execution reverted",
    });

    const { task, onchain } = await runTask(paid.id);

    expect(task.status).toBe("COMPLETED");
    expect(task.receiptStatus).toBe("FAILED");
    expect(task.receiptError).toContain("reverted");
    expect(task.result).not.toBeNull();
    expect(onchain.confirmed).toBe(false);

    const repo = getRepository();
    const stored = await repo.getTask(paid.id);
    expect(stored?.status).toBe("COMPLETED");
    expect(stored?.receiptAttempts).toBe(1);
  });

  it("records CONFIRMED and the tx hash on success", async () => {
    const paid = await seedPaidTask();
    syncMock.mockResolvedValue({
      attempted: true,
      txHashes: ["0xdeadbeef"],
      status: "Completed",
      confirmed: true,
    });

    const { task } = await runTask(paid.id);

    expect(task.status).toBe("COMPLETED");
    expect(task.receiptStatus).toBe("CONFIRMED");
    expect(task.onchainTxHash).toBe("0xdeadbeef");
    expect(task.receiptError).toBeNull();
  });

  it("marks the receipt SKIPPED when recording is not configured", async () => {
    const paid = await seedPaidTask();
    configuredMock.mockReturnValue(false);

    const { task, onchain } = await runTask(paid.id);

    expect(task.status).toBe("COMPLETED");
    expect(task.receiptStatus).toBe("SKIPPED");
    expect(onchain.attempted).toBe(false);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("marks the task FAILED only when the AI execution fails", async () => {
    const paid = await seedPaidTask();
    executeAgentMock.mockRejectedValue(new Error("llm unavailable"));

    await expect(runTask(paid.id)).rejects.toThrow("llm unavailable");

    const repo = getRepository();
    const stored = await repo.getTask(paid.id);
    expect(stored?.status).toBe("FAILED");
    expect(stored?.error).toContain("llm unavailable");
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("does not re-execute a COMPLETED task on retry", async () => {
    const paid = await seedPaidTask();
    syncMock.mockResolvedValue({
      attempted: true,
      txHashes: [],
      confirmed: false,
      error: "rpc down",
    });
    const first = await runTask(paid.id);
    expect(first.task.status).toBe("COMPLETED");
    expect(executeAgentMock).toHaveBeenCalledTimes(1);

    syncMock.mockResolvedValue({
      attempted: true,
      txHashes: ["0xabc"],
      confirmed: true,
    });
    const second = await runTask(paid.id);

    expect(executeAgentMock).toHaveBeenCalledTimes(1);
    expect(second.task.receiptStatus).toBe("CONFIRMED");
  });
});

describe("syncTaskReceipt guards", () => {
  it("rejects tasks that are not completed", async () => {
    const repo = getRepository();
    const agent = await repo.getAgentBySlug("ai-research-assistant");
    if (!agent) throw new Error("seed agent missing");
    const task = await repo.createTask({
      agentId: agent.id,
      clientAddress: "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942",
      input: "x",
      inputHash: "0x1",
      priceWei: agent.priceWei,
    });
    await expect(syncTaskReceipt(task.id)).rejects.toThrow("Only COMPLETED");
  });
});
