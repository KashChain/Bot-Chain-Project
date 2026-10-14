import { getServerConfig } from "../config";
import { getRepository, type EscrowRecord, type TaskRecord } from "../repo";

export const BPS_DENOMINATOR = 10_000;

export function platformFeeBps(): number {
  return getServerConfig().PLATFORM_FEE_BPS;
}

export function escrowMode(): "mock" | "contract" {
  return getServerConfig().ESCROW_MODE;
}

export function isEscrowOnchainConfigured(): boolean {
  const config = getServerConfig();
  return (
    config.ESCROW_MODE === "contract" &&
    typeof config.ESCROW_CONTRACT_ADDRESS === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(config.ESCROW_CONTRACT_ADDRESS)
  );
}

/** Split an amount into the platform fee and the creator's net payout (in wei). */
export function splitAmount(
  amountWei: string,
  feeBps: number = platformFeeBps(),
): { feeWei: string; netWei: string } {
  const amount = BigInt(amountWei);
  if (amount < 0n) throw new Error("Amount cannot be negative");
  if (feeBps < 0 || feeBps > BPS_DENOMINATOR) {
    throw new Error(`feeBps must be between 0 and ${BPS_DENOMINATOR}`);
  }
  const fee = (amount * BigInt(feeBps)) / BigInt(BPS_DENOMINATOR);
  const net = amount - fee;
  return { feeWei: fee.toString(), netWei: net.toString() };
}

/**
 * Lock funds for a paid task. In "mock" mode this is a backend ledger entry;
 * in "contract" mode the same record mirrors the on-chain `AgentEscrow` state.
 */
export async function lockEscrow(task: TaskRecord): Promise<EscrowRecord> {
  const repo = getRepository();
  const existing = await repo.getEscrowByTask(task.id);
  if (existing) return existing;

  const agent = await repo.getAgentById(task.agentId);
  if (!agent) throw new Error("Cannot lock escrow: agent not found");

  const feeBps = platformFeeBps();
  const { feeWei, netWei } = splitAmount(task.priceWei, feeBps);

  return repo.createEscrow({
    taskId: task.id,
    agentId: agent.id,
    ownerAddress: agent.ownerAddress,
    clientAddress: task.clientAddress,
    amountWei: task.priceWei,
    feeBps,
    feeWei,
    netWei,
  });
}

export async function getEscrow(taskId: string): Promise<EscrowRecord | null> {
  return getRepository().getEscrowByTask(taskId);
}

/** Release escrowed funds to the creator's balance. Idempotent. */
export async function releaseEscrow(
  taskId: string,
  txHash?: string | null,
): Promise<EscrowRecord | null> {
  const repo = getRepository();
  const escrow = await repo.getEscrowByTask(taskId);
  if (!escrow) return null;
  if (escrow.status !== "LOCKED") return escrow;
  return repo.updateEscrow(taskId, {
    status: "RELEASED",
    releasedAt: new Date(),
    releaseTxHash: txHash ?? null,
  });
}

/** Refund escrowed funds to the client. Idempotent. */
export async function refundEscrow(
  taskId: string,
  txHash?: string | null,
): Promise<EscrowRecord | null> {
  const repo = getRepository();
  const escrow = await repo.getEscrowByTask(taskId);
  if (!escrow) return null;
  if (escrow.status !== "LOCKED") return escrow;
  return repo.updateEscrow(taskId, {
    status: "REFUNDED",
    refundedAt: new Date(),
    refundTxHash: txHash ?? null,
  });
}
