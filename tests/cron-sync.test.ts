import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contract", () => ({
  isOnchainReceiptConfigured: vi.fn(() => true),
  syncTaskOnchain: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(() => ({
    RECEIPT_SYNC_BATCH_SIZE: 25,
    STALE_TASK_TIMEOUT_MS: 10_000_000,
    PLATFORM_FEE_BPS: 250,
    ESCROW_MODE: "mock",
    ENABLE_CREDITS: true,
    BOTCHAIN_TESTNET_CHAIN_ID: 968,
    BOTCHAIN_EXPLORER_URL: "https://scan.bohr.life",
    PAYMENT_MODE: "onchain",
    ENABLE_MOCK_PAYMENT: false,
  })),
  isPaymentRecipientConfigured: vi.fn(() => true),
}));

import { isOnchainReceiptConfigured, syncTaskOnchain } from "@/lib/contract";
import { getRepository } from "@/lib/repo";
import { runReceiptSync } from "@/lib/cron/sync";

const syncMock = vi.mocked(syncTaskOnchain);
const configuredMock = vi.mocked(isOnchainReceiptConfigured);
const CLIENT = "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";

async function seedCompletedTask() {
  const repo = getRepository();
  const agent = await repo.getAgentBySlug("ai-research-assistant");
  if (!agent) throw new Error("seed agent missing");
  const created = await repo.createTask({
    agentId: agent.id,
    clientAddress: CLIENT,
    input: "sync me",
    inputHash: "0xabc",
    priceWei: agent.priceWei,
    currency: "BOT",
  });
  return repo.updateTask(created.id, {
    status: "COMPLETED",
    resultHash: "0x" + "1".repeat(64),
    receiptStatus: "NONE",
  });
}

describe("cron receipt sync", () => {
  it("confirms a pending receipt and is idempotent on repeat runs", async () => {
    configuredMock.mockReturnValue(true);
    syncMock.mockReset();
    syncMock.mockResolvedValue({
      attempted: true,
      txHashes: ["0x" + "f".repeat(64)],
      status: "Completed",
      confirmed: true,
    });

    const task = await seedCompletedTask();

    const first = await runReceiptSync();
    expect(first.confirmed).toBeGreaterThanOrEqual(1);
    expect(first.errors).toHaveLength(0);

    const stored = await getRepository().getTask(task.id);
    expect(stored?.receiptStatus).toBe("CONFIRMED");

    const second = await runReceiptSync();
    expect(second.confirmed).toBe(0);
  });

  it("records skipped receipts when on-chain recording is disabled", async () => {
    configuredMock.mockReturnValue(false);
    syncMock.mockReset();
    const task = await seedCompletedTask();

    const result = await runReceiptSync();
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    const stored = await getRepository().getTask(task.id);
    expect(stored?.receiptStatus).toBe("SKIPPED");
    expect(syncMock).not.toHaveBeenCalled();
  });
});
