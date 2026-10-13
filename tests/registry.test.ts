import { beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, toUtf8Bytes } from "ethers";

vi.mock("@/lib/contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contract")>();
  return {
    ...actual,
    isContractAddressConfigured: vi.fn(() => false),
    isSignerConfigured: vi.fn(() => false),
    getRpcProvider: vi.fn(),
    getSignerWallet: vi.fn(),
  };
});

import {
  isContractAddressConfigured,
  isSignerConfigured,
  id32,
} from "@/lib/contract";
import { getOnchainAgentState, registerAgentOnchain } from "@/lib/registry";

const addressConfigured = vi.mocked(isContractAddressConfigured);
const signerConfigured = vi.mocked(isSignerConfigured);

beforeEach(() => {
  addressConfigured.mockReset();
  signerConfigured.mockReset();
});

describe("id32", () => {
  it("matches keccak256(utf8) for the contract's bytes32 convention", () => {
    const slug = "ai-research-assistant";
    expect(id32(slug)).toBe(keccak256(toUtf8Bytes(slug)));
  });
});

describe("getOnchainAgentState", () => {
  it("reports unconfigured when no contract address is set", async () => {
    addressConfigured.mockReturnValue(false);
    const state = await getOnchainAgentState("ai-research-assistant");
    expect(state.configured).toBe(false);
    expect(state.exists).toBe(false);
    expect(state.error).toContain("not configured");
  });
});

describe("registerAgentOnchain", () => {
  it("throws a configuration error when no signer is configured", async () => {
    signerConfigured.mockReturnValue(false);
    await expect(
      registerAgentOnchain({ slug: "ai-research-assistant", metadataUri: null }),
    ).rejects.toThrow(/requires AGENT_MARKETPLACE_CONTRACT_ADDRESS/);
  });
});
