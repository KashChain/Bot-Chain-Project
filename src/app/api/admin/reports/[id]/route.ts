import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/api";
import { assertAdmin } from "@/lib/admin";
import { resolveReport } from "@/lib/moderation/service";
import { moderationActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    assertAdmin(request);
    const body = await request.json().catch(() => null);
    const parsed = moderationActionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk({ error: "Validation failed", code: "VALIDATION_ERROR" }, 422);
    }
    const { report, agent } = await resolveReport(id, parsed.data.action, "admin");
    return jsonOk({ report, agent });
  });
}
