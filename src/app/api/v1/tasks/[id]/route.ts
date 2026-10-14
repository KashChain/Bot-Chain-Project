import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { authenticateApiKey, requireScope } from "@/lib/api-keys/auth";
import { getRepository } from "@/lib/repo";
import { getPaymentInstructions, toPublicTask } from "@/lib/tasks/service";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await authenticateApiKey(request);
    requireScope(auth, "tasks:read");
    const { id } = await params;
    const task = await getRepository().getTask(id);
    if (!task) throw new NotFoundError("Task not found");
    if (task.clientAddress.toLowerCase() !== auth.ownerAddress.toLowerCase()) {
      const agent = await getRepository().getAgentById(task.agentId);
      if (!agent || agent.ownerAddress.toLowerCase() !== auth.ownerAddress.toLowerCase()) {
        throw new ForbiddenError("This API key cannot access the requested task");
      }
    }
    return jsonOk({ task: toPublicTask(task), payment: getPaymentInstructions(task) });
  });
}
