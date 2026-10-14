import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/api";
import { assertAdmin } from "@/lib/admin";
import { getRepository } from "@/lib/repo";
import { AppError, NotFoundError } from "@/lib/errors";
import { registerAgentOnchain } from "@/lib/registry";
import { assertSafeAgentEndpoint } from "@/lib/security/ssrf";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handle(async () => {
    assertAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { slug?: string };
    const slug = body.slug?.trim();
    if (!slug) throw new AppError("A slug is required", 400, "INVALID_INPUT");

    const repo = getRepository();
    const agent = await repo.getAgentBySlug(slug);
    if (!agent) throw new NotFoundError("Agent not found");

    // Re-validate the stored endpoint before promoting it on-chain.
    await assertSafeAgentEndpoint(agent.endpoint);

    const result = await registerAgentOnchain(agent);
    return jsonOk(result);
  });
}
