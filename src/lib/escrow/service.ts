import { getServerConfig } from "../config";
import { getRepository, type EscrowRecord, type TaskRecord } from "../repo";
import { captureException, captureMessage } from "../monitoring";
import {
  isEscrowContractConfigured,
  lockEscrowOnchain,
  refundEscrowOnchain,
  releaseEscrowOnchain,
  type OnchainEscrowResult,
} from "./contract";

export const BPS_DENOMINATOR = 10_000;

export function platformFeeBps(): number {
  return getServerConfig().PLATFORM_FEE_BPS;
}

/**
 * The effective escrow backend. `contract` when the deployed `AgentEscrow`
 * contract is configured (`ESCROW_MODE=contract` + `ESCROW_CONTRACT_ADDRESS` +
 * an operator key); otherwise the backend ledger (`mock`).
 */
export function escrowMode(): "mock" | "contract" {
  return isEscrowContractConfigured() ? "contract" : "mock";
}

export function isEscrowOnchainConfigured(): boolean {
  return isEscrowContractConfigured();
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

function recordOnchainIssue(
  scope: string,
  taskId: string,
  result: OnchainEscrowResult,
): void {
  if (result.error) {
    captureException(new Error(result.error), { scope, taskId });
  } else if (result.skipped) {
    captureMessage("On-chain escrow step skipped", "warn", {
      scope,
      taskId,
      status: result.status,
    });
  }
}

/**
 * Lock funds for a paid task. Always writes the backend ledger entry; when the
 * on-chain escrow path is configured it also calls `AgentEscrow.lock` and
 * records the resulting transaction hash.
 */
export async function lockEscrow(task: TaskRecord): Promise<EscrowRecord> {
  const repo = getRepository();
  const existing = await repo.getEscrowByTask(task.id);
  if (existing) return existing;

  const agent = await repo.getAgentById(task.agentId);
  if (!agent) throw new Error("Cannot lock escrow: agent not found");

  const feeBps = platformFeeBps();
  const { feeWei, netWei } = splitAmount(task.priceWei, feeBps);

  let lockTxHash: string | null = null;
  if (isEscrowOnchainConfigured()) {
    const result = await lockEscrowOnchain({
      taskId: task.id,
      payTo: agent.ownerAddress,
      amountWei: task.priceWei,
    });
    lockTxHash = result.txHash;
    recordOnchainIssue("escrow.lock", task.id, result);
  }

  return repo.createEscrow({
    taskId: task.id,
    agentId: agent.id,
    ownerAddress: agent.ownerAddress,
    clientAddress: task.clientAddress,
    amountWei: task.priceWei,
    feeBps,
    feeWei,
    netWei,
    lockTxHash,
  });
}

export async function getEscrow(taskId: string): Promise<EscrowRecord | null> {
  return getRepository().getEscrowByTask(taskId);
}

/**
 * Release escrowed funds to the creator's balance. Idempotent. When the
 * on-chain escrow path is active, triggers `AgentEscrow.release` (fee to
 * treasury, net to the agent owner) and records the transaction hash.
 */
export async function releaseEscrow(
  taskId: string,
  txHash?: string | null,
): Promise<EscrowRecord | null> {
  const repo = getRepository();
  const escrow = await repo.getEscrowByTask(taskId);
  if (!escrow) return null;
  if (escrow.status !== "LOCKED") return escrow;

  let releaseTxHash = txHash ?? null;
  if (isEscrowOnchainConfigured()) {
    const result = await releaseEscrowOnchain(taskId);
    if (result.txHash) releaseTxHash = result.txHash;
    else recordOnchainIssue("escrow.release", taskId, result);
  }

  return repo.updateEscrow(taskId, {
    status: "RELEASED",
    releasedAt: new Date(),
    releaseTxHash,
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

  let refundTxHash = txHash ?? null;
  if (isEscrowOnchainConfigured()) {
    const result = await refundEscrowOnchain(taskId);
    if (result.txHash) refundTxHash = result.txHash;
    else recordOnchainIssue("escrow.refund", taskId, result);
  }

  return repo.updateEscrow(taskId, {
    status: "REFUNDED",
    refundedAt: new Date(),
    refundTxHash,
  });
}

/**
 * Retry on-chain settlement for escrows whose ledger state was already settled
 * off-chain but whose transaction hash is missing (e.g. a transient RPC error
 * during task execution). Idempotent; safe to call from the cron worker.
 */
export async function reconcileSettledEscrows(
  limit = 25,
): Promise<{ settled: string[]; errors: Array<{ taskId: string; message: string }> }> {
  const result: {
    settled: string[];
    errors: Array<{ taskId: string; message: string }>;
  } = { settled: [], errors: [] };
  if (!isEscrowOnchainConfigured()) return result;

  const repo = getRepository();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidates = [
    ...(await repo.listEscrows({ status: "RELEASED", since, limit })),
    ...(await repo.listEscrows({ status: "REFUNDED", since, limit })),
  ];

  for (const escrow of candidates) {
    const needsRelease = escrow.status === "RELEASED" && !escrow.releaseTxHash;
    const needsRefund = escrow.status === "REFUNDED" && !escrow.refundTxHash;
    if (!needsRelease && !needsRefund) continue;
    try {
      const outcome = needsRelease
        ? await releaseEscrowOnchain(escrow.taskId)
        : await refundEscrowOnchain(escrow.taskId);
      if (outcome.txHash) {
        await repo.updateEscrow(escrow.taskId, {
          ...(needsRelease
            ? { releaseTxHash: outcome.txHash }
            : { refundTxHash: outcome.txHash }),
        });
        result.settled.push(escrow.taskId);
      } else if (outcome.error) {
        result.errors.push({ taskId: escrow.taskId, message: outcome.error });
        captureException(new Error(outcome.error), {
          scope: "escrow.reconcile",
          taskId: escrow.taskId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      result.errors.push({ taskId: escrow.taskId, message });
      captureException(error, { scope: "escrow.reconcile", taskId: escrow.taskId });
    }
  }

  return result;
}
