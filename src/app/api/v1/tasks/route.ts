import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { authenticateApiKey, requireScope } from "@/lib/api-keys/auth";
import { getRepository } from "@/lib/repo";
import {
  createTask,
  toPublicTask,
  type CreateTaskRequest,
} from "@/lib/tasks/service";
import { v1TaskCreateSchema, v1TaskListQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const auth = await authenticateApiKey(request);
    requireScope(auth, "tasks:read");
    const parsed = v1TaskListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return jsonOk({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, 400);
    }
    const tasks = await getRepository().listTasksByClient(auth.ownerAddress);
    const filtered = parsed.data.status
      ? tasks.filter((task) => task.status === parsed.data.status)
      : tasks;
    const limit = parsed.data.limit ?? 50;
    return jsonOk({
      tasks: filtered.slice(0, limit).map((task) => toPublicTask(task)),
      total: filtered.length,
      ownerAddress: auth.ownerAddress,
    });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const auth = await authenticateApiKey(request);
    requireScope(auth, "tasks:write");
    const body = await request.json().catch(() => ({}));
    const parsed = v1TaskCreateSchema.safeParse(body);
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
    const clientAddress = parsed.data.clientAddress ?? auth.ownerAddress;
    if (clientAddress.toLowerCase() !== auth.ownerAddress.toLowerCase()) {
      return jsonOk(
        {
          error: "clientAddress must match the API key owner",
          code: "FORBIDDEN",
        },
        403,
      );
    }
    const taskRequest: CreateTaskRequest = {
      agentSlug: parsed.data.agentSlug,
      input: parsed.data.input,
      clientAddress,
      notifyEmail: parsed.data.notifyEmail ?? null,
    };
    const { task, payment } = await createTask(taskRequest);
    return jsonOk({ task, payment, apiKeyId: auth.key.id }, 201);
  });
}
