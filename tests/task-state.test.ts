import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  isTerminal,
  type TaskStatus,
} from "@/lib/task-state";

describe("task state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("CREATED", "PAYMENT_PENDING")).toBe(true);
    expect(canTransition("PAYMENT_PENDING", "PAID")).toBe(true);
    expect(canTransition("PAID", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "COMPLETED")).toBe(true);
  });

  it("rejects skipping payment", () => {
    expect(canTransition("CREATED", "PAID")).toBe(false);
    expect(canTransition("CREATED", "PROCESSING")).toBe(false);
    expect(() => assertTransition("CREATED", "PAID")).toThrow(
      /Invalid task state transition/,
    );
  });

  it("treats terminal states as final", () => {
    (["COMPLETED", "FAILED", "CANCELLED"] as TaskStatus[]).forEach((status) => {
      expect(isTerminal(status)).toBe(true);
    });
    expect(canTransition("COMPLETED", "PROCESSING")).toBe(false);
    expect(canTransition("FAILED", "COMPLETED")).toBe(false);
  });
});
