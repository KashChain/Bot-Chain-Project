import { getServerConfig } from "../config";
import { AppError, NotFoundError } from "../errors";
import { getRepository, type StakeRecord } from "../repo";
import { isEscrowOnchainConfigured } from "../escrow/service";

export function minStakeWei(): bigint {
  return BigInt(getServerConfig().MIN_STAKE_WEI);
}

export interface StakeRequest {
  amountWei: string;
  txHash?: string | null;
}

export async function stakeAgent(
  agentId: string,
  ownerAddress: string,
  request: StakeRequest,
): Promise<StakeRecord> {
  const repo = getRepository();
  const agent = await repo.getAgentById(agentId);
  if (!agent) throw new NotFoundError("Agent not found");
  if (agent.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new AppError("Only the agent owner can stake", 403, "NOT_AGENT_OWNER");
  }

  let amount: bigint;
  try {
    amount = BigInt(request.amountWei);
  } catch {
    throw new AppError("Invalid stake amount", 400, "INVALID_AMOUNT");
  }
  if (amount < minStakeWei()) {
    throw new AppError(
      `Stake must be at least ${minStakeWei().toString()} wei`,
      400,
      "STAKE_TOO_LOW",
    );
  }

  return repo.upsertStake({
    agentId: agent.id,
    ownerAddress,
    amountWei: amount.toString(),
    status: "ACTIVE",
    txHash: request.txHash ?? null,
  });
}

export async function unstakeAgent(
  agentId: string,
  ownerAddress: string,
): Promise<StakeRecord | null> {
  const repo = getRepository();
  const stake = await repo.getStakeByAgent(agentId);
  if (!stake) throw new NotFoundError("No active stake for this agent");
  if (stake.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new AppError("Only the agent owner can unstake", 403, "NOT_AGENT_OWNER");
  }
  return repo.upsertStake({
    agentId,
    ownerAddress,
    amountWei: "0",
    status: "UNSTAKED",
  });
}

export function stakeMode(): "mock" | "contract" {
  return isEscrowOnchainConfigured() ? "contract" : "mock";
}
