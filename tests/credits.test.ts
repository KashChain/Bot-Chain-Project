import { describe, expect, it } from "vitest";
import {
  getCreditBalance,
  listCreditTransactions,
  spendCredits,
  topUpCredits,
} from "@/lib/billing/credits";
import {
  cancelSubscription,
  listSubscriptions,
  subscribe,
} from "@/lib/billing/subscriptions";
import { getPlan, listPlans } from "@/lib/billing/plans";

const OWNER = "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";
const OTHER = "0x2222222222222222222222222222222222222222";

describe("platform credits", () => {
  it("tops up, spends and reports balances", async () => {
    await topUpCredits({ ownerAddress: OWNER, amountWei: "5000000000000000000" });
    expect((await getCreditBalance(OWNER)).balanceWei).toBe("5000000000000000000");

    await spendCredits({
      ownerAddress: OWNER,
      amountWei: "1000000000000000000",
      reference: `spend:${OWNER}:1`,
    });
    expect((await getCreditBalance(OWNER)).balanceWei).toBe("4000000000000000000");

    const transactions = await listCreditTransactions(OWNER);
    expect(transactions.length).toBeGreaterThanOrEqual(2);
    expect(transactions.some((tx) => tx.type === "SPEND")).toBe(true);
  });

  it("is idempotent for a repeated top-up reference", async () => {
    const reference = `topup:${OWNER}:fixed`;
    const first = await topUpCredits({ ownerAddress: OTHER, amountWei: "2000000000000000000", reference });
    const balanceAfterFirst = (await getCreditBalance(OTHER)).balanceWei;
    const second = await topUpCredits({ ownerAddress: OTHER, amountWei: "2000000000000000000", reference });
    expect(second.id).toBe(first.id);
    expect((await getCreditBalance(OTHER)).balanceWei).toBe(balanceAfterFirst);
  });

  it("rejects overspending", async () => {
    await expect(
      spendCredits({
        ownerAddress: OTHER,
        amountWei: "999000000000000000000",
        reference: `overspend:${OTHER}`,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("subscriptions", () => {
  it("exposes plans and grants credits on subscribe", async () => {
    expect(listPlans().length).toBeGreaterThanOrEqual(3);
    const plan = getPlan("builder");
    expect(plan).not.toBeNull();

    const before = BigInt((await getCreditBalance(OWNER)).balanceWei);
    const subscription = await subscribe({ ownerAddress: OWNER, planId: "builder" });
    const after = BigInt((await getCreditBalance(OWNER)).balanceWei);
    expect(subscription.planId).toBe("builder");
    expect(after - before).toBe(BigInt(plan!.monthlyCreditsWei));

    const again = await subscribe({ ownerAddress: OWNER, planId: "builder" });
    expect(again.id).toBe(subscription.id);
    expect(BigInt((await getCreditBalance(OWNER)).balanceWei)).toBe(after);

    const cancelled = await cancelSubscription(subscription.id, OWNER);
    expect(cancelled.status).toBe("CANCELLED");
    const list = await listSubscriptions(OWNER);
    expect(list.some((sub) => sub.id === subscription.id)).toBe(true);
  });
});
