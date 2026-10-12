import { handle, jsonOk } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { getRepository } from "@/lib/repo";
import { toPublicTask } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const repo = getRepository();
    const task = await repo.getTask(id);
    if (!task) throw new NotFoundError("Task not found");
    const agent = await repo.getAgentById(task.agentId);
    return jsonOk({ task: toPublicTask(task, agent?.name) });
  });
}
