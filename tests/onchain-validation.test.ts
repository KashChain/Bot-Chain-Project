import { describe, expect, it } from "vitest";
import {
  assertBytes32,
  isValidBytes32,
  normalizeBytes32,
  normalizePrivateKey,
  redactSecrets,
} from "@/lib/onchain/validation";

const KEY = "5ac4a514b7d79d85fb67230cac635eeb723d5fdb4072314122a0f6aa985bc346";

describe("normalizePrivateKey", () => {
  it("accepts a bare 64-character hex key", () => {
    expect(normalizePrivateKey(KEY)).toBe(`0x${KEY}`);
  });

  it("accepts a 0x-prefixed key and normalizes case/whitespace", () => {
    expect(normalizePrivateKey(`  0x${KEY.toUpperCase()}  `)).toBe(
      `0x${KEY}`,
    );
  });

  it("rejects the production failure mode: a leading '='", () => {
    expect(() => normalizePrivateKey(`=0x${KEY}`)).toThrow(
      /must contain only the 64-character hex key/,
    );
  });

  it("rejects an entire NAME=VALUE assignment", () => {
    expect(() => normalizePrivateKey(`DEPLOYER_PRIVATE_KEY=0x${KEY}`)).toThrow(
      /must contain only the 64-character hex key/,
    );
  });

  it("rejects short, long and non-hex values", () => {
    expect(() => normalizePrivateKey(KEY.slice(0, 63))).toThrow(/64 hex/);
    expect(() => normalizePrivateKey(`${KEY}ab`)).toThrow(/64 hex/);
    expect(() => normalizePrivateKey(`0x${"z".repeat(64)}`)).toThrow(/64 hex/);
  });

  it("rejects missing or empty values", () => {
    expect(() => normalizePrivateKey(undefined)).toThrow(/not configured/);
    expect(() => normalizePrivateKey("   ")).toThrow(/empty/);
  });

  it("never includes the secret in error messages", () => {
    try {
      normalizePrivateKey(`=0x${KEY}`);
      throw new Error("expected failure");
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(KEY);
    }
  });
});

describe("bytes32 validation", () => {
  const valid = `0x${"a".repeat(64)}`;

  it("accepts a valid bytes32 value", () => {
    expect(isValidBytes32(valid)).toBe(true);
    expect(assertBytes32(valid.toUpperCase().replace("0X", "0x"), "hash")).toBe(
      valid,
    );
  });

  it("normalizes malformed duplicate prefixes from the production incident", () => {
    const malformed = `0x=0x${KEY}`;
    const expected = `0x${KEY}`;
    expect(isValidBytes32(malformed)).toBe(true);
    expect(normalizeBytes32(malformed)).toBe(expected);
    expect(assertBytes32(malformed, "resultHash")).toBe(expected);
  });

  it("strips repeated 0x prefixes and canonicalizes hash case", () => {
    expect(assertBytes32(`0x0X${KEY.toUpperCase()}`, "paymentRef")).toBe(
      `0x${KEY}`,
    );
  });

  it("rejects values without a 0x prefix or with the wrong length", () => {
    expect(isValidBytes32("a".repeat(64))).toBe(false);
    expect(isValidBytes32(`0x${"a".repeat(63)}`)).toBe(false);
    expect(isValidBytes32(`0x${"a".repeat(65)}`)).toBe(false);
    expect(isValidBytes32(undefined)).toBe(false);
  });

  it("does not leak the rejected value in the error message", () => {
    try {
      assertBytes32(`0x=0x${KEY}z`, "resultHash");
      throw new Error("expected failure");
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(KEY);
    }
  });
});

describe("redactSecrets", () => {
  it("redacts the malformed-key incident string", () => {
    const message = `invalid BytesLike value (argument="value", value="0x=0x${KEY}", code=INVALID_ARGUMENT)`;
    const redacted = redactSecrets(message);
    expect(redacted).not.toContain(KEY);
    expect(redacted).toContain("[redacted]");
  });

  it("redacts standalone 64-hex secrets", () => {
    expect(redactSecrets(`key=${KEY}`)).toBe("key=[redacted]");
  });

  it("leaves short hex values and normal text untouched", () => {
    expect(redactSecrets("nonce 0xabc failed")).toBe("nonce 0xabc failed");
  });
});
