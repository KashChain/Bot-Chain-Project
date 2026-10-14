import { NextRequest } from "next/server";
import { handle, jsonOk, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requireSessionIfEnforced } from "@/lib/auth/session";
import { getRepository } from "@/lib/repo";
import { AppError } from "@/lib/errors";
import { reportAgent } from "@/lib/moderation/service";
import { reportAgentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    checkRateLimit(rateLimitKey("agents:report", getClientIp(request)));

    const body = await request.json().catch(() => null);
    const parsed = reportAgentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        422,
      );
    }

    const session = requireSessionIfEnforced(request);
    const reporter = (session?.address ?? parsed.data.reporterAddress ?? "").toLowerCase();
    if (!reporter) {
      throw new AppError("A reporter address is required", 400, "MISSING_REPORTER");
    }

    const repo = getRepository();
    const agent =
      (await repo.getAgentById(id)) ?? (await repo.getAgentBySlug(id));
    if (!agent) throw new AppError("Agent not found", 404, "NOT_FOUND");

    const report = await reportAgent(agent.id, {
      reporterAddress: reporter,
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
    });

    return jsonOk({ report }, 201);
  });
}
