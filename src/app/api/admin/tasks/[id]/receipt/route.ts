import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/api";
import { assertAdmin } from "@/lib/admin";
import { getRepository } from "@/lib/repo";
import { NotFoundError } from "@/lib/errors";
import { toPublicTask } from "@/lib/tasks/service";
import { syncTaskReceipt } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertAdmin(request);
    const { id } = await params;
    const onchain = await syncTaskReceipt(id);
    const repo = getRepository();
    const task = await repo.getTask(id);
    if (!task) throw new NotFoundError("Task not found");
    const agent = await repo.getAgentById(task.agentId);
    return jsonOk({ task: toPublicTask(task, agent?.name), onchain });
  });
}
