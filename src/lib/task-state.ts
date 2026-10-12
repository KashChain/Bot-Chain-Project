export const TASK_STATUSES = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  CREATED: ["PAYMENT_PENDING", "CANCELLED", "FAILED"],
  PAYMENT_PENDING: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["PROCESSING", "FAILED", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task state transition: ${from} -> ${to}`);
  }
}

export const TERMINAL_STATUSES: TaskStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
