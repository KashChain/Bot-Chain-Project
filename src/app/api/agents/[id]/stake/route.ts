import { NextRequest } from "next/server";
import { handle, jsonOk, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requireSessionIfEnforced } from "@/lib/auth/session";
import { getRepository } from "@/lib/repo";
import { AppError } from "@/lib/errors";
import { stakeAgent, unstakeAgent } from "@/lib/staking/service";
import { stakeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function resolveAgentId(id: string): Promise<string> {
  const repo = getRepository();
  const agent = (await repo.getAgentById(id)) ?? (await repo.getAgentBySlug(id));
  if (!agent) throw new AppError("Agent not found", 404, "NOT_FOUND");
  return agent.id;
}

function requireOwner(request: NextRequest, provided?: string): string {
  const session = requireSessionIfEnforced(request);
  const owner = (session?.address ?? provided ?? "").toLowerCase();
  if (!owner) throw new AppError("An owner address is required", 400, "MISSING_OWNER");
  return owner;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    checkRateLimit(rateLimitKey("agents:stake", getClientIp(request)));
    const body = await request.json().catch(() => null);
    const parsed = stakeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk({ error: "Validation failed", code: "VALIDATION_ERROR" }, 422);
    }
    const agentId = await resolveAgentId(id);
    const owner = requireOwner(request, parsed.data.ownerAddress);
    const stake = await stakeAgent(agentId, owner, {
      amountWei: parsed.data.amountWei,
      txHash: parsed.data.txHash ?? null,
    });
    return jsonOk({ stake }, 201);
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const agentId = await resolveAgentId(id);
    const owner = requireOwner(request);
    const stake = await unstakeAgent(agentId, owner);
    return jsonOk({ stake });
  });
}
