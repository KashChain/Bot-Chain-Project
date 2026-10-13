import { handle, jsonOk } from "@/lib/api";
import { getRepository } from "@/lib/repo";
import { NotFoundError } from "@/lib/errors";
import { getOnchainAgentState } from "@/lib/registry";

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
    const onchain = await getOnchainAgentState(agent.slug);
    return jsonOk({ onchain });
  });
}
