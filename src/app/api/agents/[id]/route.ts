import { handle, jsonOk } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { getRepository } from "@/lib/repo";
import { toPublicAgent } from "@/lib/agents/public";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const repo = getRepository();
    const agent =
      (await repo.getAgentBySlug(id)) ?? (await repo.getAgentById(id));
    if (!agent) throw new NotFoundError("Agent not found");
    return jsonOk({ agent: toPublicAgent(agent) });
  });
}
