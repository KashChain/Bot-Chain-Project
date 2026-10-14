import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  createApiKey,
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  revokeApiKey,
  toPublicApiKey,
  verifyApiKey,
} from "@/lib/api-keys/service";
import { extractApiKeyToken } from "@/lib/api-keys/auth";
import { getRepository } from "@/lib/repo";
import { enforceRateLimit, resetRateLimitStore } from "@/lib/rate-limit";

const OWNER = "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";

describe("api key generation", () => {
  it("prefixes tokens and never exposes the raw key in the hash", () => {
    const generated = generateApiKey();
    expect(generated.token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(isValidApiKeyFormat(generated.token)).toBe(true);
    expect(generated.keyHash).toBe(hashApiKey(generated.token));
    expect(generated.keyHash).not.toContain(generated.token);
    expect(generated.keyPrefix.endsWith("...")).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(isValidApiKeyFormat(undefined)).toBe(false);
    expect(isValidApiKeyFormat("nope")).toBe(false);
    expect(isValidApiKeyFormat("ab_short")).toBe(false);
  });
});

describe("api key lifecycle", () => {
  it("creates, verifies and revokes a key", async () => {
    const created = await createApiKey({ name: "test key", ownerAddress: OWNER });
    expect(created.token.startsWith(API_KEY_PREFIX)).toBe(true);

    const verified = await verifyApiKey(created.token);
    expect(verified?.ownerAddress).toBe(OWNER.toLowerCase());

    const stored = await getRepository().getApiKeyByHash(hashApiKey(created.token));
    expect(stored).not.toBeNull();
    const publicKey = toPublicApiKey(stored!);
    expect(JSON.stringify(publicKey)).not.toContain(created.token);

    await revokeApiKey(created.id, OWNER);
    expect(await verifyApiKey(created.token)).toBeNull();
  });

  it("rejects an unknown token and forbids cross-owner revocation", async () => {
    const created = await createApiKey({ name: "owned", ownerAddress: OWNER });
    expect(await verifyApiKey(generateApiKey().token)).toBeNull();
    await expect(
      revokeApiKey(created.id, "0x1111111111111111111111111111111111111111"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("api key request parsing", () => {
  function requestWith(headers: Record<string, string>) {
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    } as never;
  }

  it("reads bearer tokens and x-api-key headers", () => {
    expect(
      extractApiKeyToken(requestWith({ authorization: "Bearer ab_abc123456789012345" })),
    ).toBe("ab_abc123456789012345");
    expect(extractApiKeyToken(requestWith({ "x-api-key": "ab_other12345678901234" }))).toBe(
      "ab_other12345678901234",
    );
    expect(extractApiKeyToken(requestWith({}))).toBeNull();
  });
});

describe("sliding-window rate limiting", () => {
  it("blocks once the limit is exceeded and reports remaining", async () => {
    resetRateLimitStore();
    const key = `test:${Date.now()}`;
    const first = await enforceRateLimit(key, 2, 60_000);
    const second = await enforceRateLimit(key, 2, 60_000);
    const third = await enforceRateLimit(key, 2, 60_000);
    expect(first.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
