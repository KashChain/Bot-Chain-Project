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

async function seedCompletedTask(options: { resultHash?: string; slug?: string } = {}) {
  const repo = getRepository();
  const agent = await repo.getAgentBySlug(options.slug ?? "dao-research-agent");
  if (!agent) throw new Error("seed agent missing");
  const task = await repo.createTask({
    agentId: agent.id,
    clientAddress: "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942",
    input: "Analyse Proposal #42",
    inputHash: "0xabc",
    priceWei: agent.priceWei,
    currency: "BOT",
  });
  return repo.updateTask(task.id, {
    status: "COMPLETED",
    result: { summary: "saved research output" },
    resultHash: options.resultHash ?? `0x${"b".repeat(64)}`,
  });
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

describe("syncTaskReceipt validation and retry safety", () => {
  it("normalizes a malformed result hash before contract interaction and keeps the saved result", async () => {
    const hashBody = "5ac4a514b7d79d85fb67230cac635eeb723d5fdb4072314122a0f6aa985bc346";
    const task = await seedCompletedTask({ resultHash: `0x=0x${hashBody}` });
    syncMock.mockResolvedValue({
      attempted: true,
      txHashes: [],
      status: "Completed",
      confirmed: true,
    });

    const result = await syncTaskReceipt(task.id);

    expect(result.confirmed).toBe(true);
    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({ resultHash: `0x${hashBody}` }),
    );

    const stored = await getRepository().getTask(task.id);
    expect(stored?.status).toBe("COMPLETED");
    expect(stored?.result).toEqual({ summary: "saved research output" });
    expect(stored?.receiptStatus).toBe("CONFIRMED");
  });

  it("increments receipt attempts on every retry without re-executing the agent", async () => {
    const task = await seedCompletedTask();
    syncMock.mockResolvedValue({
      attempted: true,
      txHashes: [],
      confirmed: false,
      error: "rpc down",
    });

    await syncTaskReceipt(task.id);
    await syncTaskReceipt(task.id);

    expect(syncMock).toHaveBeenCalledTimes(2);
    const stored = await getRepository().getTask(task.id);
    expect(stored?.receiptAttempts).toBe(2);
    expect(stored?.status).toBe("COMPLETED");
  });

  it("deduplicates concurrent retries into a single contract submission", async () => {
    const task = await seedCompletedTask();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    syncMock.mockImplementation(async () => {
      await gate;
      return {
        attempted: true,
        txHashes: [`0x${"c".repeat(64)}`],
        status: "Completed",
        confirmed: true,
      };
    });

    const first = syncTaskReceipt(task.id);
    const second = syncTaskReceipt(task.id);
    // Give the first attempt a tick to reach the (gated) contract call.
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();

    const [a, b] = await Promise.all([first, second]);

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(a.confirmed).toBe(true);
    expect(b).toEqual(a);
  });
});
