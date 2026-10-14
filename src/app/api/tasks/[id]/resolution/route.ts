import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/api";
import { assertAdmin } from "@/lib/admin";
import { getRepository } from "@/lib/repo";
import { AppError, NotFoundError } from "@/lib/errors";
import { assertTransition, ESCROWABLE_STATUSES } from "@/lib/task-state";
import { refundEscrow, releaseEscrow } from "@/lib/escrow/service";
import { resolutionSchema } from "@/lib/validation";
import { toPublicTask } from "@/lib/tasks/service";
import { notifyTaskEvent } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    assertAdmin(request);

    const body = await request.json().catch(() => null);
    const parsed = resolutionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk(
        { error: "Validation failed", code: "VALIDATION_ERROR" },
        422,
      );
    }

    const repo = getRepository();
    const task = await repo.getTask(id);
    if (!task) throw new NotFoundError("Task not found");
    if (!ESCROWABLE_STATUSES.includes(task.status)) {
      throw new AppError(
        `Task in status ${task.status} has no escrow to resolve`,
        409,
        "NOT_RESOLVABLE",
      );
    }

    const openDispute = await repo.getOpenDisputeByTask(task.id);
    const refunding = parsed.data.action === "refund";
    const nextStatus = refunding ? "REFUNDED" : "COMPLETED";

    assertTransition(task.status, nextStatus);
    const updated = await repo.updateTask(task.id, {
      status: nextStatus,
      error: refunding ? task.error ?? "Refunded by moderation" : null,
    });

    if (refunding) {
      await refundEscrow(task.id);
    } else {
      await releaseEscrow(task.id);
    }

    if (openDispute) {
      await repo.updateDispute(openDispute.id, {
        status: refunding ? "REFUNDED" : "RELEASED",
        resolvedBy: "admin",
        resolvedAt: new Date(),
      });
    }

    await notifyTaskEvent(updated, refunding ? "TASK_REFUNDED" : "TASK_COMPLETED", {
      resolution: parsed.data.action,
    });

    return jsonOk({ task: toPublicTask(updated) });
  });
}
