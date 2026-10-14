import { NextRequest } from "next/server";
import { handle, jsonOk, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getRepository } from "@/lib/repo";
import { requireSessionIfEnforced } from "@/lib/auth/session";
import { AppError, NotFoundError } from "@/lib/errors";
import { assertTransition, DISPUTABLE_STATUSES } from "@/lib/task-state";
import { createDisputeSchema } from "@/lib/validation";
import { toPublicTask } from "@/lib/tasks/service";
import { notifyTaskEvent } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    checkRateLimit(rateLimitKey("tasks:dispute", getClientIp(request)));

    const body = await request.json().catch(() => null);
    const parsed = createDisputeSchema.safeParse(body);
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

    const repo = getRepository();
    const task = await repo.getTask(id);
    if (!task) throw new NotFoundError("Task not found");

    const opener = (session?.address ?? parsed.data.openedBy ?? "").toLowerCase();
    if (!opener) {
      throw new AppError("An opener address is required", 400, "MISSING_OPENER");
    }
    if (opener !== task.clientAddress.toLowerCase()) {
      throw new AppError("Only the task's client can open a dispute", 403, "FORBIDDEN");
    }
    if (!DISPUTABLE_STATUSES.includes(task.status)) {
      throw new AppError(
        `Task in status ${task.status} cannot be disputed`,
        409,
        "NOT_DISPUTABLE",
      );
    }

    assertTransition(task.status, "DISPUTED");
    const updated = await repo.updateTask(task.id, { status: "DISPUTED" });
    const dispute = await repo.createDispute({
      taskId: task.id,
      openedBy: opener,
      reason: parsed.data.reason,
    });

    await notifyTaskEvent(updated, "TASK_DISPUTED", {
      reason: parsed.data.reason,
      disputeId: dispute.id,
    });

    return jsonOk({ task: toPublicTask(updated), dispute }, 201);
  });
}
