import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(() => ({
    PLATFORM_FEE_BPS: 250,
    ESCROW_MODE: "mock",
    MIN_STAKE_WEI: "1000000000000000000",
  })),
}));

import { listReportQueue, reportAgent, resolveReport } from "@/lib/moderation/service";
import { getRepository } from "@/lib/repo";

const REPORTER = "0x2222222222222222222222222222222222222222";
const OWNER = "0x1111111111111111111111111111111111111111";

async function makeAgent() {
  const repo = getRepository();
  return repo.createAgent({
    slug: `moderate-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: "Moderation agent",
    description: "An agent used to exercise the moderation queue tests here.",
    category: "Research",
    capabilities: ["Moderate"],
    usageInstructions: "Describe the task for the moderation test here.",
    endpoint: "https://example.com/moderate",
    priceWei: "1000000000000000000",
    ownerAddress: OWNER,
  });
}

describe("moderation", () => {
  it("creates reports and lists the open queue", async () => {
    const agent = await makeAgent();
    const report = await reportAgent(agent.id, {
      reporterAddress: REPORTER,
      reason: "spam",
      details: "Looks like spam",
    });
    expect(report.status).toBe("OPEN");

    const queue = await listReportQueue("OPEN");
    expect(queue.some((entry) => entry.id === report.id)).toBe(true);
  });

  it("suspends an agent when a report is actioned", async () => {
    const agent = await makeAgent();
    const report = await reportAgent(agent.id, {
      reporterAddress: REPORTER,
      reason: "abuse",
    });
    const { report: resolved, agent: updated } = await resolveReport(
      report.id,
      "suspend",
      "admin",
    );
    expect(resolved.status).toBe("SUSPENDED");
    expect(resolved.reviewedBy).toBe("admin");
    expect(updated?.status).toBe("SUSPENDED");
    expect(updated?.active).toBe(false);
  });

  it("bans an agent and dismisses clean reports", async () => {
    const agent = await makeAgent();
    const report = await reportAgent(agent.id, {
      reporterAddress: REPORTER,
      reason: "fraud",
    });
    const { agent: banned } = await resolveReport(report.id, "ban", "admin");
    expect(banned?.status).toBe("BANNED");

    const other = await reportAgent(agent.id, {
      reporterAddress: REPORTER,
      reason: "false alarm",
    });
    const { report: dismissed, agent: untouched } = await resolveReport(
      other.id,
      "dismiss",
      "admin",
    );
    expect(dismissed.status).toBe("DISMISSED");
    expect(untouched).toBeNull();
  });
});
