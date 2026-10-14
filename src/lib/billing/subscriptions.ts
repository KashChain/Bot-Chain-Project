import { AppError, ConflictError, NotFoundError } from "../errors";
import { getRepository } from "../repo";
import type { SubscriptionRecord } from "../repo/types";
import { getPlan } from "./plans";
import { topUpCredits } from "./credits";

const DAY_MS = 24 * 60 * 60 * 1000;

export function subscriptionPeriodEnd(planId: string, from = new Date()): Date {
  const plan = getPlan(planId);
  const days = plan?.periodDays ?? 30;
  return new Date(from.getTime() + days * DAY_MS);
}

async function grantPlanCredits(
  subscription: SubscriptionRecord,
): Promise<void> {
  const plan = getPlan(subscription.planId);
  if (!plan || BigInt(plan.monthlyCreditsWei) <= 0n) return;
  await topUpCredits({
    ownerAddress: subscription.ownerAddress,
    amountWei: plan.monthlyCreditsWei,
    reference: `sub:${subscription.id}:${subscription.periodStart.toISOString()}`,
  });
}

export async function subscribe(input: {
  ownerAddress: string;
  planId: string;
  agentId?: string | null;
}): Promise<SubscriptionRecord> {
  const plan = getPlan(input.planId);
  if (!plan) throw new AppError(`Unknown plan: ${input.planId}`, 400, "UNKNOWN_PLAN");

  const repo = getRepository();
  const existing = await repo.listSubscriptionsByOwner(input.ownerAddress);
  const active = existing.find(
    (sub) =>
      sub.status === "ACTIVE" &&
      sub.planId === plan.id &&
      (sub.agentId ?? null) === (input.agentId ?? null),
  );
  if (active) return active;

  const periodStart = new Date();
  const subscription = await repo.createSubscription({
    ownerAddress: input.ownerAddress,
    planId: plan.id,
    agentId: input.agentId ?? null,
    status: "ACTIVE",
    periodStart,
    periodEnd: subscriptionPeriodEnd(plan.id, periodStart),
  });
  await grantPlanCredits(subscription);
  return subscription;
}

export async function cancelSubscription(
  id: string,
  ownerAddress?: string,
): Promise<SubscriptionRecord> {
  const repo = getRepository();
  const subscription = await repo.getSubscription(id);
  if (!subscription) throw new NotFoundError("Subscription not found");
  if (
    ownerAddress &&
    subscription.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()
  ) {
    throw new ConflictError("You can only cancel your own subscription");
  }
  if (subscription.status === "CANCELLED") return subscription;
  return repo.updateSubscription(id, {
    status: "CANCELLED",
    cancelAtPeriodEnd: true,
    cancelledAt: new Date(),
  });
}

export async function listSubscriptions(
  ownerAddress: string,
): Promise<SubscriptionRecord[]> {
  return getRepository().listSubscriptionsByOwner(ownerAddress);
}

/**
 * Renew a subscription for another period and grant the new period's credits.
 * Idempotent: credits use a per-period reference so repeated renewals for the
 * same period never double-credit.
 */
export async function renewSubscription(id: string): Promise<SubscriptionRecord> {
  const repo = getRepository();
  const subscription = await repo.getSubscription(id);
  if (!subscription) throw new NotFoundError("Subscription not found");
  if (subscription.status === "EXPIRED") return subscription;
  const now = new Date();
  const periodStart = subscription.periodEnd > now ? subscription.periodEnd : now;
  const updated = await repo.updateSubscription(id, {
    status: "ACTIVE",
    periodStart,
    periodEnd: subscriptionPeriodEnd(subscription.planId, periodStart),
    cancelAtPeriodEnd: false,
  });
  await grantPlanCredits(updated);
  return updated;
}

export function isSubscriptionActive(
  subscription: SubscriptionRecord,
  now = new Date(),
): boolean {
  return subscription.status === "ACTIVE" && subscription.periodEnd > now;
}
