import { NextRequest } from "next/server";
import { jsonOk, handle, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerConfig } from "@/lib/config";
import { getRepository } from "@/lib/repo";
import { getSession } from "@/lib/auth/session";
import { AppError, NotFoundError } from "@/lib/errors";
import { createReviewSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handle(async () => {
    checkRateLimit(rateLimitKey("reviews:create", getClientIp(request)));

    const body = await request.json().catch(() => null);
    const parsed = createReviewSchema.safeParse(body);
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

    const config = getServerConfig();
    const session = getSession(request);
    if (config.hasSession && !session) {
      return jsonOk(
        { error: "Sign in with your wallet to leave a review", code: "UNAUTHENTICATED" },
        401,
      );
    }

    const repo = getRepository();
    const task = await repo.getTask(parsed.data.taskId);
    if (!task) throw new NotFoundError("Task not found");

    if (task.status !== "COMPLETED") {
      throw new AppError(
        "Only completed tasks can be reviewed",
        400,
        "TASK_NOT_COMPLETED",
      );
    }

    const reviewer = (
      session?.address ??
      parsed.data.reviewerAddress ??
      ""
    ).toLowerCase();
    if (!reviewer) {
      throw new AppError(
        "A reviewer address is required",
        400,
        "MISSING_REVIEWER",
      );
    }
    if (reviewer !== task.clientAddress.toLowerCase()) {
      throw new AppError(
        "Only the task's client can review it",
        403,
        "FORBIDDEN",
      );
    }

    const existing = await repo.getReviewByTask(task.id);
    if (existing) {
      throw new AppError("This task already has a review", 409, "CONFLICT");
    }

    const review = await repo.createReview({
      taskId: task.id,
      agentId: task.agentId,
      reviewerAddress: reviewer,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    });

    return jsonOk({ review }, 201);
  });
}
