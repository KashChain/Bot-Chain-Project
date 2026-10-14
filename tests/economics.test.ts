import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(() => ({
    PLATFORM_FEE_BPS: 250,
    ESCROW_MODE: "mock",
    MIN_STAKE_WEI: "1000000000000000000",
  })),
}));

import {
  lockEscrow,
  platformFeeBps,
  refundEscrow,
  releaseEscrow,
  splitAmount,
} from "@/lib/escrow/service";
import { getCreatorEarnings } from "@/lib/creators/earnings";
import { stakeAgent, unstakeAgent } from "@/lib/staking/service";
import { getRepository } from "@/lib/repo";

const OWNER = "0x1111111111111111111111111111111111111111";
const CLIENT = "0x2222222222222222222222222222222222222222";
const PRICE = "1000000000000000000";

async function makeAgent(slug: string, owner = OWNER) {
  const repo = getRepository();
  return repo.createAgent({
    slug,
    name: `Econ ${slug}`,
    description: "An economics test agent with a sufficiently long description.",
    category: "Research",
    capabilities: ["Test"],
    usageInstructions: "Describe the task in detail for the economics test.",
    endpoint: "https://example.com/econ",
    priceWei: PRICE,
    ownerAddress: owner,
  });
}

async function makePaidTask(agentId: string, client = CLIENT) {
  const repo = getRepository();
  const task = await repo.createTask({
    agentId,
    clientAddress: client,
    input: "economics test input",
    inputHash: "0xabc",
    priceWei: PRICE,
    status: "PAID",
    notifyEmail: null,
  });
  const escrow = await lockEscrow(task);
  return { task, escrow };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fee splitting", () => {
  it("reads the platform fee from config", () => {
    expect(platformFeeBps()).toBe(250);
  });

  it("splits amount into fee and net", () => {
    expect(splitAmount("1000000000000000000", 250)).toEqual({
      feeWei: "25000000000000000",
      netWei: "975000000000000000",
    });
  });

  it("rounds the fee down with integer math", () => {
    expect(splitAmount("999", 250)).toEqual({ feeWei: "24", netWei: "975" });
  });

  it("supports a zero fee", () => {
    expect(splitAmount(PRICE, 0)).toEqual({ feeWei: "0", netWei: PRICE });
  });
});

describe("escrow lifecycle", () => {
  it("locks, releases and refunds once", async () => {
    const agent = await makeAgent(`econ-lock-${Date.now()}`);
    const { task, escrow } = await makePaidTask(agent.id);

    expect(escrow.status).toBe("LOCKED");
    expect(escrow.feeWei).toBe("25000000000000000");
    expect(escrow.netWei).toBe("975000000000000000");

    const released = await releaseEscrow(task.id);
    expect(released?.status).toBe("RELEASED");
    expect(released?.releasedAt).toBeInstanceOf(Date);

    const again = await releaseEscrow(task.id);
    expect(again?.status).toBe("RELEASED");
  });

  it("refunds a locked escrow", async () => {
    const agent = await makeAgent(`econ-refund-${Date.now()}`);
    const { task } = await makePaidTask(agent.id);
    const refunded = await refundEscrow(task.id);
    expect(refunded?.status).toBe("REFUNDED");
  });
});

describe("creator earnings", () => {
  it("aggregates released net minus processed payouts", async () => {
    const owner = `0x${Date.now().toString(16).padStart(40, "0").slice(-40)}`;
    const agent = await makeAgent(`econ-earn-${Date.now()}`, owner);
    const { task } = await makePaidTask(agent.id);
    await releaseEscrow(task.id);

    const earnings = await getCreatorEarnings(owner);
    expect(earnings.releasedNetWei).toBe("975000000000000000");
    expect(earnings.feeWei).toBe("25000000000000000");
    expect(earnings.availableWei).toBe("975000000000000000");
    expect(earnings.agents).toHaveLength(1);
    expect(earnings.agents[0].completedTasks).toBe(1);

    const repo = getRepository();
    await repo.createPayout({
      ownerAddress: owner,
      amountWei: earnings.availableWei,
      status: "PROCESSED",
      processedAt: new Date(),
    });

    const after = await getCreatorEarnings(owner);
    expect(after.paidOutWei).toBe("975000000000000000");
    expect(after.availableWei).toBe("0");
  });

  it("tracks locked net separately", async () => {
    const owner = `0x${"c".repeat(40)}`;
    const agent = await makeAgent(`econ-locked-${Date.now()}`, owner);
    await makePaidTask(agent.id);
    const earnings = await getCreatorEarnings(owner);
    expect(earnings.lockedNetWei).toBe("975000000000000000");
    expect(earnings.availableWei).toBe("0");
  });
});

describe("staking", () => {
  it("requires the minimum and the owner", async () => {
    const agent = await makeAgent(`stake-${Date.now()}`);
    await expect(
      stakeAgent(agent.id, OWNER, { amountWei: "10" }),
    ).rejects.toThrow(/at least/i);

    await expect(
      stakeAgent(agent.id, CLIENT, { amountWei: "1000000000000000000" }),
    ).rejects.toThrow(/owner/i);

    const stake = await stakeAgent(agent.id, OWNER, {
      amountWei: "2000000000000000000",
    });
    expect(stake.status).toBe("ACTIVE");
    expect(stake.amountWei).toBe("2000000000000000000");

    const unstaked = await unstakeAgent(agent.id, OWNER);
    expect(unstaked?.status).toBe("UNSTAKED");
  });
});
