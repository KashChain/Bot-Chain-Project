export const RECEIPT_STATUSES = [
  "NONE",
  "SKIPPED",
  "PENDING",
  "CONFIRMED",
  "FAILED",
] as const;

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export function isReceiptStatus(value: unknown): value is ReceiptStatus {
  return (
    typeof value === "string" &&
    (RECEIPT_STATUSES as readonly string[]).includes(value)
  );
}

export function isReceiptSettled(status: ReceiptStatus): boolean {
  return status === "CONFIRMED" || status === "FAILED";
}
