import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, jsonOk, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { createTaskSchema } from "@/lib/validation";
import { createTask, toPublicTask } from "@/lib/tasks/service";
import { getRepository } from "@/lib/repo";
import { getServerConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { requireSessionIfEnforced } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const listQuery = z.object({ clientAddress: z.string().optional() });

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = requireSessionIfEnforced(request);

    let clientAddress: string | undefined;
    if (session) {
      clientAddress = session.address;
    } else {
      const parsed = listQuery.safeParse(
        Object.fromEntries(request.nextUrl.searchParams.entries()),
      );
      if (!parsed.success || !parsed.data.clientAddress) {
        throw new AppError(
          "Query parameter clientAddress is required",
          400,
          "MISSING_CLIENT",
        );
      }
      clientAddress = parsed.data.clientAddress;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(clientAddress)) {
      throw new AppError("clientAddress must be a valid EVM address", 400, "BAD_ADDRESS");
    }
    const repo = getRepository();
    const tasks = await repo.listTasksByClient(clientAddress);
    return jsonOk({ tasks: tasks.map((task) => toPublicTask(task)) });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    checkRateLimit(rateLimitKey("tasks:create", getClientIp(request)));
    const config = getServerConfig();
    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
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
    if (parsed.data.input.length > config.MAX_PROMPT_CHARS) {
      throw new AppError(
        `Input exceeds maximum length of ${config.MAX_PROMPT_CHARS} characters`,
        413,
        "INPUT_TOO_LONG",
      );
    }
    const { task, payment } = await createTask({
      agentSlug: parsed.data.agentSlug,
      input: parsed.data.input,
      clientAddress: parsed.data.clientAddress,
      notifyEmail: parsed.data.notifyEmail ?? null,
    });
    return jsonOk({ task, payment }, 201);
  });
}
