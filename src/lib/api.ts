import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "./errors";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown): NextResponse {
  const { status, body } = toErrorResponse(error);
  return NextResponse.json(body, { status });
}

export async function handle<T>(
  fn: () => Promise<NextResponse<T>>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      console.error("[api] unexpected error:", error.message);
    }
    return jsonError(error);
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
