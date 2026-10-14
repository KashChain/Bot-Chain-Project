export const ESCROW_STATUSES = ["LOCKED", "RELEASED", "REFUNDED"] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

export const DISPUTE_STATUSES = [
  "OPEN",
  "REFUNDED",
  "RELEASED",
  "REJECTED",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const REPORT_STATUSES = [
  "OPEN",
  "DISMISSED",
  "SUSPENDED",
  "BANNED",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const STAKE_STATUSES = ["ACTIVE", "UNSTAKED"] as const;
export type StakeStatus = (typeof STAKE_STATUSES)[number];

export const PAYOUT_STATUSES = ["PENDING", "PROCESSED"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const NOTIFICATION_STATUSES = [
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
