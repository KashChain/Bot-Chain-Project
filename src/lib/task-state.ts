export const TASK_STATUSES = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "DISPUTED",
  "REFUND_REQUESTED",
  "REFUNDED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  CREATED: ["PAYMENT_PENDING", "CANCELLED", "FAILED"],
  PAYMENT_PENDING: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["PROCESSING", "FAILED", "CANCELLED", "DISPUTED", "REFUND_REQUESTED"],
  PROCESSING: ["COMPLETED", "FAILED", "DISPUTED", "REFUND_REQUESTED"],
  COMPLETED: ["DISPUTED"],
  FAILED: ["DISPUTED", "REFUND_REQUESTED", "REFUNDED"],
  CANCELLED: ["REFUND_REQUESTED", "REFUNDED"],
  DISPUTED: ["REFUND_REQUESTED", "REFUNDED", "COMPLETED"],
  REFUND_REQUESTED: ["REFUNDED", "COMPLETED"],
  REFUNDED: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task state transition: ${from} -> ${to}`);
  }
}

export const TERMINAL_STATUSES: TaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses whose escrowed funds are still held and may be released/refunded. */
export const ESCROWABLE_STATUSES: TaskStatus[] = [
  "PAID",
  "PROCESSING",
  "FAILED",
  "DISPUTED",
  "REFUND_REQUESTED",
];

/** Statuses that signal a client has raised a problem with the task. */
export const DISPUTABLE_STATUSES: TaskStatus[] = [
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
];
