import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeProvider {
  getNetwork: () => Promise<{ chainId: bigint }>;
  getTransaction: (hash: string) => Promise<unknown>;
  getTransactionReceipt: (hash: string) => Promise<unknown>;
}

let providerImpl: FakeProvider;

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return {
    ...actual,
    JsonRpcProvider: vi.fn().mockImplementation(() => providerImpl),
  };
});

import { verifyOnchainPayment } from "@/lib/payment";

const RECIPIENT = "0x1111111111111111111111111111111111111111";
const SENDER = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const AMOUNT = "10000000000000000";

function baseProvider(overrides: Partial<FakeProvider> = {}): FakeProvider {
  return {
    getNetwork: async () => ({ chainId: 968n }),
    getTransaction: async () => ({
      hash: "0xabc",
      from: SENDER,
      to: RECIPIENT,
      value: BigInt(AMOUNT),
      blockNumber: 42,
    }),
    getTransactionReceipt: async () => ({ status: 1 }),
    ...overrides,
  };
}

const input = {
  txHash: "0xabc",
  expectedTo: RECIPIENT,
  expectedAmountWei: AMOUNT,
  expectedFrom: SENDER,
};

beforeEach(() => {
  providerImpl = baseProvider();
});

describe("verifyOnchainPayment", () => {
  it("accepts a correct confirmed payment", async () => {
    const result = await verifyOnchainPayment(input);
    expect(result.status).toBe("confirmed");
    expect(result.toAddress).toBe(RECIPIENT.toLowerCase());
    expect(result.fromAddress).toBe(SENDER.toLowerCase());
    expect(result.amountWei).toBe(AMOUNT);
  });

  it("rejects a wrong recipient", async () => {
    providerImpl = baseProvider({
      getTransaction: async () => ({
        hash: "0xabc",
        from: SENDER,
        to: OTHER,
        value: BigInt(AMOUNT),
        blockNumber: 42,
      }),
    });
    await expect(verifyOnchainPayment(input)).rejects.toMatchObject({
      code: "RECIPIENT_MISMATCH",
      status: 400,
    });
  });

  it("rejects a payment from a different wallet", async () => {
    providerImpl = baseProvider({
      getTransaction: async () => ({
        hash: "0xabc",
        from: OTHER,
        to: RECIPIENT,
        value: BigInt(AMOUNT),
        blockNumber: 42,
      }),
    });
    await expect(verifyOnchainPayment(input)).rejects.toMatchObject({
      code: "SENDER_MISMATCH",
    });
  });

  it("rejects an underpaid transaction", async () => {
    providerImpl = baseProvider({
      getTransaction: async () => ({
        hash: "0xabc",
        from: SENDER,
        to: RECIPIENT,
        value: BigInt(AMOUNT) - 1n,
        blockNumber: 42,
      }),
    });
    await expect(verifyOnchainPayment(input)).rejects.toMatchObject({
      code: "AMOUNT_TOO_LOW",
    });
  });

  it("rejects a reverted transaction", async () => {
    providerImpl = baseProvider({
      getTransactionReceipt: async () => ({ status: 0 }),
    });
    await expect(verifyOnchainPayment(input)).rejects.toMatchObject({
      code: "TX_REVERTED",
    });
  });

  it("reports a pending transaction separately", async () => {
    providerImpl = baseProvider({
      getTransactionReceipt: async () => null,
    });
    await expect(verifyOnchainPayment(input)).rejects.toMatchObject({
      code: "TX_PENDING",
      status: 409,
    });
  });

  it("reports an unknown transaction hash as not found", async () => {
    providerImpl = baseProvider({ getTransaction: async () => null });
    await expect(verifyOnchainPayment(input)).rejects.toMatchObject({
      code: "TX_NOT_FOUND",
      status: 404,
    });
  });

  it("rejects an RPC reporting the wrong chain", async () => {
    providerImpl = baseProvider({ getNetwork: async () => ({ chainId: 1n }) });
    await expect(verifyOnchainPayment(input)).rejects.toMatchObject({
      code: "CHAIN_ID_MISMATCH",
    });
  });
});
