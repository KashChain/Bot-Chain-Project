import { describe, expect, it } from "vitest";
import { jsonError } from "@/lib/api";
import { RateLimitError } from "@/lib/errors";

describe("rate limit responses", () => {
  it("adds a Retry-After header for rate limit errors", () => {
    const response = jsonError(new RateLimitError("slow down", 42));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  it("omits Retry-After when the delay is unknown", () => {
    const response = jsonError(new RateLimitError("slow down"));
    expect(response.headers.get("Retry-After")).toBeNull();
  });

  it("never emits a zero Retry-After", () => {
    const response = jsonError(new RateLimitError("slow down", 0));
    expect(response.headers.get("Retry-After")).toBe("1");
  });
});
