import { describe, expect, it } from "vitest";
import { createAgentSchema, createTaskSchema } from "@/lib/validation";
import { botToWei } from "@/lib/seed-agents";
import { hashResult, sha256Hex } from "@/lib/hash";

describe("validation", () => {
  const validAgent = {
    name: "Test Agent",
    slug: "test-agent",
    description: "A valid description that is long enough for the schema.",
    category: "Research" as const,
    capabilities: ["Summaries"],
    usageInstructions: "Ask a clear question to get an answer.",
    endpoint: "https://example.com/agent",
    priceWei: "10000000000000000",
    ownerAddress: "0x1111111111111111111111111111111111111111",
  };

  it("accepts a valid agent", () => {
    expect(createAgentSchema.safeParse(validAgent).success).toBe(true);
  });

  it("rejects invalid slugs and endpoints", () => {
    expect(
      createAgentSchema.safeParse({ ...validAgent, slug: "Bad Slug" }).success,
    ).toBe(false);
    expect(
      createAgentSchema.safeParse({ ...validAgent, endpoint: "ftp://x" }).success,
    ).toBe(false);
  });

  it("rejects a non-integer price", () => {
    expect(
      createAgentSchema.safeParse({ ...validAgent, priceWei: "1.5" }).success,
    ).toBe(false);
  });

  it("validates task input", () => {
    expect(
      createTaskSchema.safeParse({
        agentSlug: "test-agent",
        input: "This is a task",
        clientAddress: validAgent.ownerAddress,
      }).success,
    ).toBe(true);
    expect(
      createTaskSchema.safeParse({
        agentSlug: "test-agent",
        input: "x",
        clientAddress: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("conversions and hashing", () => {
  it("converts BOT to wei", () => {
    expect(botToWei(1)).toBe("1000000000000000000");
    expect(botToWei(0.01)).toBe("10000000000000000");
    expect(botToWei(0.02)).toBe("20000000000000000");
  });

  it("hashes deterministically", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(hashResult({ a: 1 })).toBe(hashResult({ a: 1 }));
    expect(hashResult({ a: 1 })).not.toBe(hashResult({ a: 2 }));
    expect(hashResult({ a: 1 }).startsWith("0x")).toBe(true);
  });
});
