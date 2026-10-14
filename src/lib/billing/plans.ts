export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceWei: string;
  monthlyCreditsWei: string;
  periodDays: number;
  features: string[];
}

const ETHER = BigInt(10) ** BigInt(18);

function bot(whole: string): string {
  const [intPart, frac = ""] = whole.split(".");
  const padded = frac.padEnd(18, "0").slice(0, 18);
  return (BigInt(intPart) * ETHER + BigInt(padded || "0")).toString();
}

/**
 * Subscription tiers. Prices and credits are expressed in BOT wei. The free
 * tier is always available; paid tiers top up the owner's platform credit
 * balance each billing period.
 */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Explorer",
    description: "Browse the marketplace and run a handful of demo tasks.",
    priceWei: "0",
    monthlyCreditsWei: bot("1"),
    periodDays: 30,
    features: ["Marketplace access", "1 BOT credits / month", "Community support"],
  },
  {
    id: "builder",
    name: "Builder",
    description: "Ship agents and automate workflows with programmatic API access.",
    priceWei: bot("0.05"),
    monthlyCreditsWei: bot("10"),
    periodDays: 30,
    features: [
      "Programmatic API keys",
      "10 BOT credits / month",
      "Usage analytics",
      "Priority queue",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    description: "High-volume operators with dedicated throughput and support.",
    priceWei: bot("0.25"),
    monthlyCreditsWei: bot("60"),
    periodDays: 30,
    features: [
      "Higher API rate limits",
      "60 BOT credits / month",
      "Creator leaderboards",
      "Email support",
    ],
  },
];

export function listPlans(): SubscriptionPlan[] {
  return SUBSCRIPTION_PLANS.map((plan) => ({ ...plan }));
}

export function getPlan(planId: string): SubscriptionPlan | null {
  const normalized = planId.trim().toLowerCase();
  return (
    SUBSCRIPTION_PLANS.find((plan) => plan.id === normalized) ?? null
  );
}
