import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(() => ({
    BOTCHAIN_TESTNET_CHAIN_ID: 968,
    BOTCHAIN_EXPLORER_URL: "https://scan.bohr.life",
    PAYMENT_MODE: "onchain",
    ENABLE_MOCK_PAYMENT: false,
    PLATFORM_FEE_BPS: 250,
    ESCROW_MODE: "mock",
    ENABLE_CREDITS: true,
  })),
  isPaymentRecipientConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/payments/tokens", () => ({
  CREDIT_CURRENCY: "CREDITS",
  getTokenBySymbol: vi.fn(() => ({ symbol: "BOT", decimals: 18 })),
  verifyTokenPayment: vi.fn(),
}));

import { verifyTokenPayment } from "@/lib/payments/tokens";
import { getRepository } from "@/lib/repo";
import { createTask, submitPayment, runTask } from "@/lib/tasks/service";

const verifyMock = vi.mocked(verifyTokenPayment);
const RECIPIENT = "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";
const CLIENT = "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";

async function newTask(input = "Summarise BOT Chain") {
  const result = await createTask({
    agentSlug: "ai-research-assistant",
    input,
    clientAddress: CLIENT,
  });
  return result.task;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT = RECIPIENT;
  verifyMock.mockReset();
  verifyMock.mockResolvedValue({
    txHash: "0x" + "a".repeat(64),
    chainId: 968,
    fromAddress: CLIENT.toLowerCase(),
    toAddress: RECIPIENT.toLowerCase(),
    amountWei: "10000000000000000",
    status: "confirmed",
    blockNumber: 1,
  });
});

describe("payment replay protection", () => {
  it("rejects a transaction hash already used by another task", async () => {
    const first = await newTask("first");
    const hash = "0x" + "b".repeat(64);
    verifyMock.mockResolvedValue({
      txHash: hash,
      chainId: 968,
      fromAddress: CLIENT.toLowerCase(),
      toAddress: RECIPIENT.toLowerCase(),
      amountWei: "10000000000000000",
      status: "confirmed",
      blockNumber: 1,
    });
    await submitPayment(first.id, hash);

    const second = await newTask("second");
    await expect(submitPayment(second.id, hash)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
  });

  it("rejects a second payment on an already paid task", async () => {
    const task = await newTask("pay twice");
    await submitPayment(task.id, "0x" + "c".repeat(64));
    await expect(
      submitPayment(task.id, "0x" + "d".repeat(64)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });
});

describe("duplicate execution protection", () => {
  it("rejects executing a task that is already processing", async () => {
    const task = await newTask("processing");
    const repo = getRepository();
    await repo.updateTask(task.id, { status: "PROCESSING" });
    await expect(runTask(task.id)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
  });

  it("rejects executing a task that is not paid", async () => {
    const task = await newTask("unpaid");
    await expect(runTask(task.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
