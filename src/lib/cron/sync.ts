import { getServerConfig } from "../config";
import { getRepository } from "../repo";
import { refundEscrow } from "../escrow/service";
import { notifyTaskEvent } from "../notifications/service";
import { syncTaskReceipt } from "../tasks/service";
import { captureException } from "../monitoring";
import type { OnchainReceiptResult } from "../contract";

export interface SyncRunResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scanned: number;
  confirmed: number;
  failed: number;
  skipped: number;
  staleRefunded: string[];
  errors: Array<{ taskId: string; message: string }>;
}

function classify(result: OnchainReceiptResult): "confirmed" | "failed" | "skipped" {
  if (result.confirmed) return "confirmed";
  if (result.attempted && result.txHashes.length === 0) return "failed";
  if (!result.attempted) return "skipped";
  return "failed";
}

/**
 * Reconcile pending on-chain receipts and time out stale payments/tasks.
 *
 * Idempotent by construction:
 *  - `syncTaskReceipt` returns early for tasks already CONFIRMED;
 *  - stale tasks are selected only while PAID/PROCESSING, so they are not
 *    re-processed after being marked FAILED;
 *  - escrow refunds are idempotent in the escrow service.
 * Safe to run repeatedly from a scheduler.
 */
export async function runReceiptSync(): Promise<SyncRunResult> {
  const startedAt = new Date();
  const config = getServerConfig();
  const repo = getRepository();

  const result: SyncRunResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    durationMs: 0,
    scanned: 0,
    confirmed: 0,
    failed: 0,
    skipped: 0,
    staleRefunded: [],
    errors: [],
  };

  const pending = await repo.listUnconfirmedReceiptTasks();
  const batch = pending.slice(0, config.RECEIPT_SYNC_BATCH_SIZE);
  result.scanned = batch.length;

  for (const task of batch) {
    try {
      const outcome = await syncTaskReceipt(task.id);
      result[classify(outcome)] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      result.errors.push({ taskId: task.id, message });
      captureException(error, { scope: "cron.sync-receipts", taskId: task.id });
    }
  }

  const staleBefore = new Date(startedAt.getTime() - config.STALE_TASK_TIMEOUT_MS);
  const stale = await repo.listStaleActiveTasks(staleBefore);
  for (const task of stale) {
    try {
      const failed = await repo.updateTask(task.id, {
        status: "FAILED",
        error: "Timed out awaiting agent execution; auto-refunded by sync job",
      });
      await refundEscrow(task.id);
      await notifyTaskEvent(failed, "TASK_FAILED", {
        reason: "stale_timeout",
      });
      result.staleRefunded.push(task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      result.errors.push({ taskId: task.id, message });
      captureException(error, { scope: "cron.stale-task", taskId: task.id });
    }
  }

  const finishedAt = new Date();
  result.finishedAt = finishedAt.toISOString();
  result.durationMs = finishedAt.getTime() - startedAt.getTime();
  return result;
}
