import { beforeAll, describe, expect, it } from "vitest";
import { getAddress, Wallet } from "ethers";
import {
  buildSiweMessage,
  parseSiweMessage,
  recoverSiweAddress,
} from "@/lib/auth/siwe";
import { issueNonce, consumeNonce } from "@/lib/auth/nonce-store";

const wallet = Wallet.createRandom();

function sampleMessage(overrides: Partial<Parameters<typeof buildSiweMessage>[0]> = {}) {
  return buildSiweMessage({
    domain: "localhost:3000",
    address: wallet.address,
    uri: "http://localhost:3000",
    chainId: 968,
    nonce: "abcdef0123456789",
    statement: "Sign in to AgentHub AI.",
    expirationTime: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  });
}

describe("siwe message", () => {
  it("parses a freshly built message", () => {
    const message = sampleMessage();
    const parsed = parseSiweMessage(message);
    expect(parsed).not.toBeNull();
    expect(parsed?.domain).toBe("localhost:3000");
    expect(parsed?.address).toBe(getAddress(wallet.address));
    expect(parsed?.chainId).toBe(968);
    expect(parsed?.nonce).toBe("abcdef0123456789");
    expect(parsed?.statement).toBe("Sign in to AgentHub AI.");
    expect(parsed?.expirationTime).toBeTruthy();
  });

  it("rejects malformed messages", () => {
    expect(parseSiweMessage("not a siwe message")).toBeNull();
    expect(
      parseSiweMessage(
        [
          "example.com wants you to sign in with your Ethereum account:",
          "0xnot-an-address",
          "",
          "URI: https://example.com",
          "Version: 1",
          "Chain ID: 968",
          "Nonce: abc",
          "Issued At: 2026-01-01T00:00:00.000Z",
        ].join("\n"),
      ),
    ).toBeNull();
  });

  it("recovers the signing address", async () => {
    const message = sampleMessage();
    const signature = await wallet.signMessage(message);
    expect(await recoverSiweAddress(message, signature)).toBe(
      getAddress(wallet.address),
    );
  });

  it("rejects a signature from a different wallet", async () => {
    const message = sampleMessage();
    const other = Wallet.createRandom();
    const signature = await other.signMessage(message);
    const recovered = await recoverSiweAddress(message, signature);
    expect(recovered).not.toBe(getAddress(wallet.address));
  });
});

describe("siwe nonce store", () => {
  it("issues single-use nonces bound to an address", () => {
    const address = getAddress(wallet.address);
    const nonce = issueNonce(address);
    expect(nonce.length).toBeGreaterThanOrEqual(8);
    expect(consumeNonce(nonce)).toEqual({ address: address.toLowerCase() });
    expect(consumeNonce(nonce)).toBeNull();
  });
});

describe("session tokens", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "unit-test-session-secret-0123456789";
  });

  it("round-trips a signed session and rejects tampering", async () => {
    const { createSessionToken, verifySessionToken } = await import(
      "@/lib/auth/session"
    );
    const token = createSessionToken(wallet.address);
    const payload = verifySessionToken(token);
    expect(payload?.address).toBe(wallet.address.toLowerCase());
    expect(verifySessionToken(`${token}x`)).toBeNull();
    const parts = token.split(".");
    expect(verifySessionToken(`${parts[0]}.deadbeef`)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });
});
