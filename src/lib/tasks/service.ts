import { AppError, ConflictError, NotFoundError } from "../errors";
import { getServerConfig, isPaymentRecipientConfigured } from "../config";
import { getRepository, type AgentRecord, type TaskRecord } from "../repo";
import { hashResult, sha256Hex } from "../hash";
import { executeAgent } from "../ai/executor";
import { verifyPayment } from "../payment";
import { syncTaskOnchain } from "../contract";
import { assertTransition } from "../task-state";
import type { PaymentInstructions, PublicTask } from "./types";

export type { PaymentInstructions, PublicTask };

export interface CreateTaskRequest {
  agentSlug: string;
  input: string;
  clientAddress: string;
}

function preview(input: string): string {
  return input.length > 160 ? `${input.slice(0, 160)}...` : input;
}

export function toPublicTask(
  task: TaskRecord,
  agentName?: string,
): PublicTask {
  const config = getServerConfig();
  return {
    id: task.id,
    agentSlug: task.agentSlug,
    agentName,
    clientAddress: task.clientAddress,
    inputPreview: preview(task.input),
    inputHash: task.inputHash,
    status: task.status,
    priceWei: task.priceWei,
    currency: task.currency,
    paymentTxHash: task.paymentTxHash,
    resultHash: task.resultHash,
    result: task.result,
    error: task.error,
    onchainTxHash: task.onchainTxHash,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    explorerUrl: task.onchainTxHash
      ? `${config.BOTCHAIN_EXPLORER_URL}/tx/${task.onchainTxHash}`
      : null,
  };
}

export function getPaymentInstructions(task: TaskRecord): PaymentInstructions {
  const config = getServerConfig();
  const recipient = isPaymentRecipientConfigured()
    ? (process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT as string)
    : null;
  const mockEnabled = config.ENABLE_MOCK_PAYMENT;
  const wei = BigInt(task.priceWei);
  const whole = wei / BigInt(10) ** BigInt(18);
  const fraction = (wei % BigInt(10) ** BigInt(18))
    .toString()
    .padStart(18, "0")
    .slice(0, 4);
  return {
    currency: task.currency,
    amountWei: task.priceWei,
    amountFormatted: `${whole}.${fraction}`,
    recipient,
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    explorerUrl: config.BOTCHAIN_EXPLORER_URL,
    mode: mockEnabled ? "mock" : config.PAYMENT_MODE,
  };
}

export async function createTask(
  request: CreateTaskRequest,
): Promise<{ task: PublicTask; payment: PaymentInstructions }> {
  const repo = getRepository();
  const agent = await repo.getAgentBySlug(request.agentSlug);
  if (!agent) throw new NotFoundError("Agent not found");
  if (!agent.active) throw new AppError("Agent is not accepting tasks", 409, "AGENT_INACTIVE");

  const inputHash = `0x${sha256Hex(request.input)}`;
  let task = await repo.createTask({
    agentId: agent.id,
    clientAddress: request.clientAddress,
    input: request.input,
    inputHash,
    priceWei: agent.priceWei,
    currency: "BOT",
    status: "CREATED",
  });

  assertTransition(task.status, "PAYMENT_PENDING");
  task = await repo.updateTask(task.id, { status: "PAYMENT_PENDING" });
  await repo.upsertWallet(request.clientAddress);

  return { task: toPublicTask(task, agent.name), payment: getPaymentInstructions(task) };
}

export async function submitPayment(
  taskId: string,
  txHash: string,
): Promise<{ task: PublicTask; verified: boolean }> {
  const repo = getRepository();
  const task = await repo.getTask(taskId);
  if (!task) throw new NotFoundError("Task not found");

  if (task.status !== "PAYMENT_PENDING" && task.status !== "CREATED") {
    throw new ConflictError(
      `Task is in status ${task.status} and cannot accept a new payment`,
    );
  }

  if (!isPaymentRecipientConfigured()) {
    throw new AppError(
      "Payment recipient is not configured on the server (NEXT_PUBLIC_PAYMENT_RECIPIENT).",
      503,
      "RECIPIENT_NOT_CONFIGURED",
    );
  }

  const existingByTx = await repo.getTaskByPaymentTx(txHash);
  if (existingByTx && existingByTx.id !== taskId) {
    throw new ConflictError("This transaction hash is already used by another task");
  }

  const recipient = process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT as string;
  const verified = await verifyPayment({
    txHash,
    expectedTo: recipient,
    expectedAmountWei: task.priceWei,
    expectedFrom: task.clientAddress,
  });

  await repo.createPayment({
    taskId: task.id,
    txHash: verified.txHash,
    chainId: verified.chainId,
    fromAddress: verified.fromAddress,
    toAddress: verified.toAddress,
    amountWei: verified.amountWei,
    status: verified.status,
  });

  assertTransition(task.status, "PAID");
  const updated = await repo.updateTask(task.id, {
    status: "PAID",
    paymentTxHash: verified.txHash,
    paymentVerifiedAt: new Date(),
  });

  return { task: toPublicTask(updated), verified: verified.status === "confirmed" };
}

export async function runTask(
  taskId: string,
): Promise<{ task: PublicTask; onchain: unknown }> {
  const repo = getRepository();
  const task = await repo.getTask(taskId);
  if (!task) throw new NotFoundError("Task not found");

  if (task.status === "PROCESSING") {
    throw new ConflictError("Task is already being processed");
  }
  if (task.status === "COMPLETED") {
    return { task: toPublicTask(task), onchain: { attempted: false, skippedReason: "Already completed" } };
  }
  if (task.status !== "PAID") {
    throw new ConflictError(
      `Task must be PAID before execution. Current status: ${task.status}`,
    );
  }

  const agent = await repo.getAgentById(task.agentId);
  if (!agent) throw new NotFoundError("Agent not found");

  assertTransition(task.status, "PROCESSING");
  await repo.updateTask(task.id, { status: "PROCESSING" });

  try {
    const outcome = await executeAgent(agent, task.id, task.input);
    const resultHash = hashResult(outcome.output);
    const wrapped = {
      mode: outcome.mode,
      model: outcome.model,
      output: outcome.output,
    };

    assertTransition("PROCESSING", "COMPLETED");
    const completed = await repo.updateTask(task.id, {
      status: "COMPLETED",
      result: wrapped as unknown,
      resultRef: `db:task:${task.id}`,
      resultHash,
      error: null,
    });

    const onchain = await recordOnchain(completed, agent, resultHash);
    if (onchain.txHashes.length > 0) {
      const finalTask = await repo.updateTask(task.id, {
        onchainTxHash: onchain.txHashes[onchain.txHashes.length - 1],
      });
      return { task: toPublicTask(finalTask, agent.name), onchain };
    }
    return { task: toPublicTask(completed, agent.name), onchain };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";
    await repo.updateTask(task.id, { status: "FAILED", error: message });
    throw error;
  }
}

async function recordOnchain(
  task: TaskRecord,
  agent: AgentRecord,
  resultHash: string,
) {
  const recipient = isPaymentRecipientConfigured()
    ? (process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT as string)
    : agent.ownerAddress;
  return syncTaskOnchain({
    taskId: task.id,
    agentId: agent.slug,
    client: task.clientAddress,
    amountWei: task.priceWei,
    payTo: recipient,
    paymentRef: task.paymentTxHash ?? `0x${"0".repeat(64)}`,
    resultHash,
  });
}
