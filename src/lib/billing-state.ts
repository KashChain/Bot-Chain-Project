export const SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const CREDIT_TX_TYPES = [
  "TOPUP",
  "SPEND",
  "REFUND",
  "ADJUSTMENT",
] as const;

export type CreditTxType = (typeof CREDIT_TX_TYPES)[number];
