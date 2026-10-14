import { describe, expect, it } from "vitest";
import {
  CREDIT_CURRENCY,
  NATIVE_TOKEN_SYMBOL,
  formatTokenAmount,
  getSupportedTokens,
  getTokenBySymbol,
  isSupportedToken,
  parseTokenAmount,
} from "@/lib/payments/tokens";

describe("token registry", () => {
  it("always includes native BOT and platform credits", () => {
    const symbols = getSupportedTokens().map((token) => token.symbol);
    expect(symbols).toContain(NATIVE_TOKEN_SYMBOL);
    expect(symbols).toContain(CREDIT_CURRENCY);
    expect(isSupportedToken("bot")).toBe(true);
    expect(getTokenBySymbol("CREDITS")?.decimals).toBe(18);
    expect(isSupportedToken("DOGE")).toBe(false);
  });

  it("parses and formats amounts with token decimals", () => {
    expect(parseTokenAmount("1.5", 18)).toBe(1500000000000000000n);
    expect(parseTokenAmount("2.5", 6)).toBe(2500000n);
    expect(formatTokenAmount(1500000000000000000n, 18)).toBe("1.5000");
    expect(formatTokenAmount(2500000n, 6)).toBe("2.5000");
  });
});
