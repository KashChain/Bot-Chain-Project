import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { getLeaderboard, getPlatformMetrics } from "@/lib/analytics/service";
import { analyticsQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const parsed = analyticsQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return jsonOk({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, 400);
    }
    const windowDays = parsed.data.windowDays ?? 30;
    const limit = parsed.data.limit ?? 10;
    const [metrics, leaderboard] = await Promise.all([
      getPlatformMetrics(windowDays),
      getLeaderboard({ limit, windowDays }),
    ]);
    return jsonOk({ metrics, leaderboard });
  });
}
