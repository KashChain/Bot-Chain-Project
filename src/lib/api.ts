import { NextResponse, type NextRequest } from "next/server";
import { RateLimitError, toErrorResponse } from "./errors";
import { captureException } from "./monitoring";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown): NextResponse {
  const { status, body } = toErrorResponse(error);
  const headers: Record<string, string> = {};
  if (error instanceof RateLimitError && error.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(Math.max(1, error.retryAfterSeconds));
  }
  return NextResponse.json(body, { status, headers });
}

export async function handle<T>(
  fn: () => Promise<NextResponse<T>>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      captureException(error, { scope: "api" });
    }
    return jsonError(error);
  }
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
}

/** Attach standard rate-limit headers to a successful API-key response. */
export function withRateLimitHeaders<T extends NextResponse>(
  response: T,
  info: RateLimitInfo,
): T {
  response.headers.set("X-RateLimit-Limit", String(info.limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, info.remaining)));
  return response;
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
