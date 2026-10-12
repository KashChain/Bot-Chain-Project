import { NextRequest } from "next/server";
import { handle, jsonOk, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { runTask } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    checkRateLimit(rateLimitKey("tasks:execute", getClientIp(request)));
    const { task, onchain } = await runTask(id);
    return jsonOk({ task, onchain });
  });
}
