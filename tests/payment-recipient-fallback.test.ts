import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  isPaymentRecipientConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/payments/tokens", () => ({
  CREDIT_CURRENCY: "CREDITS",
  getTokenBySymbol: vi.fn(() => ({ symbol: "BOT", decimals: 18 })),
  verifyTokenPayment: vi.fn(),
}));

import { verifyTokenPayment } from "@/lib/payments/tokens";
import { DEFAULT_TESTNET_PAYMENT_RECIPIENT } from "@/lib/payments/recipient";
import { createTask, submitPayment } from "@/lib/tasks/service";

const verifyMock = vi.mocked(verifyTokenPayment);
const CLIENT = `0x${"33".repeat(20)}`;

async function newTask() {
  return createTask({
    agentSlug: "ai-research-assistant",
    input: "Summarise BOT Chain payment fallback",
    clientAddress: CLIENT,
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PAYMENT_RECIPIENT", "");
  vi.stubEnv("PLATFORM_TREASURY_ADDRESS", "");
  verifyMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("payment recipient fallback (under-configured deployment)", () => {
  it("returns the default testnet recipient in payment instructions", async () => {
    const { payment } = await newTask();
    expect(payment.mode).toBe("onchain");
    expect(payment.recipient).toBe(DEFAULT_TESTNET_PAYMENT_RECIPIENT);
    expect(payment.recipientSource).toBe("default");
  });

  it("verifies against the fallback recipient instead of failing with 503", async () => {
    const hash = `0x${"a".repeat(64)}`;
    verifyMock.mockResolvedValue({
      txHash: hash,
      chainId: 968,
      fromAddress: CLIENT.toLowerCase(),
      toAddress: DEFAULT_TESTNET_PAYMENT_RECIPIENT.toLowerCase(),
      amountWei: "10000000000000000",
      status: "confirmed",
      blockNumber: 1,
    });

    const { task } = await newTask();
    const result = await submitPayment(task.id, hash);

    expect(result.task.status).toBe("PAID");
    expect(verifyMock).toHaveBeenCalledTimes(1);
    const input = verifyMock.mock.calls[0][0] as { expectedTo: string };
    expect(input.expectedTo).toBe(DEFAULT_TESTNET_PAYMENT_RECIPIENT);
  });

  it("uses the treasury address when only that is configured", async () => {
    const treasury = `0x${"44".repeat(20)}`;
    vi.stubEnv("PLATFORM_TREASURY_ADDRESS", treasury);
    const { payment } = await newTask();
    expect(payment.recipient).toBe(treasury);
    expect(payment.recipientSource).toBe("treasury");
  });
});
