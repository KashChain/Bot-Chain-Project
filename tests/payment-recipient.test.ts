import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TESTNET_PAYMENT_RECIPIENT,
  getPaymentRecipient,
  hasExplicitPaymentRecipient,
  isValidAddress,
  resolvePaymentRecipient,
} from "@/lib/payments/recipient";
import { logPaymentRecipientConfigWarning } from "@/lib/config";

const ENV_RECIPIENT = `0x${"11".repeat(20)}`;
const TREASURY = `0x${"22".repeat(20)}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("payment recipient resolution", () => {
  it("validates addresses", () => {
    expect(isValidAddress(ENV_RECIPIENT)).toBe(true);
    expect(isValidAddress(`  ${ENV_RECIPIENT}  `)).toBe(true);
    expect(isValidAddress("not-an-address")).toBe(false);
    expect(isValidAddress("0x123")).toBe(false);
    expect(isValidAddress(undefined)).toBe(false);
    expect(isValidAddress(null)).toBe(false);
    expect(isValidAddress(42)).toBe(false);
  });

  it("prefers the explicit NEXT_PUBLIC_PAYMENT_RECIPIENT", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_RECIPIENT", ENV_RECIPIENT);
    vi.stubEnv("PLATFORM_TREASURY_ADDRESS", TREASURY);
    expect(resolvePaymentRecipient()).toEqual({
      address: ENV_RECIPIENT,
      source: "env",
    });
    expect(hasExplicitPaymentRecipient()).toBe(true);
  });

  it("falls back to PLATFORM_TREASURY_ADDRESS when the recipient is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_RECIPIENT", "");
    vi.stubEnv("PLATFORM_TREASURY_ADDRESS", TREASURY);
    expect(resolvePaymentRecipient()).toEqual({
      address: TREASURY,
      source: "treasury",
    });
    expect(hasExplicitPaymentRecipient()).toBe(false);
  });

  it("falls back to the default testnet recipient when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_RECIPIENT", "");
    vi.stubEnv("PLATFORM_TREASURY_ADDRESS", "");
    expect(resolvePaymentRecipient()).toEqual({
      address: DEFAULT_TESTNET_PAYMENT_RECIPIENT,
      source: "default",
    });
    expect(getPaymentRecipient()).toBe(DEFAULT_TESTNET_PAYMENT_RECIPIENT);
    expect(isValidAddress(DEFAULT_TESTNET_PAYMENT_RECIPIENT)).toBe(true);
  });

  it("ignores malformed addresses and falls through to the default", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_RECIPIENT", "not-an-address");
    vi.stubEnv("PLATFORM_TREASURY_ADDRESS", "0x123");
    expect(resolvePaymentRecipient()).toEqual({
      address: DEFAULT_TESTNET_PAYMENT_RECIPIENT,
      source: "default",
    });
  });

  it("trims whitespace around a valid address", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_RECIPIENT", `  ${ENV_RECIPIENT}  `);
    expect(resolvePaymentRecipient().address).toBe(ENV_RECIPIENT);
  });
});

describe("startup configuration warning", () => {
  it("warns once when no recipient is explicitly configured", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_RECIPIENT", "");
    vi.stubEnv("PLATFORM_TREASURY_ADDRESS", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logPaymentRecipientConfigWarning();
    logPaymentRecipientConfigWarning();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(
      "NEXT_PUBLIC_PAYMENT_RECIPIENT",
    );
    expect(String(warn.mock.calls[0][0])).toContain(
      DEFAULT_TESTNET_PAYMENT_RECIPIENT,
    );
  });
});
