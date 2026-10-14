import { getServerConfig } from "../config";
import { getRepository } from "../repo";
import { reconcileSettledEscrows, refundEscrow } from "../escrow/service";
import { notifyTaskEvent } from "../notifications/service";
import { syncTaskReceipt } from "../tasks/service";
import { captureException, captureMessage } from "../monitoring";
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
  escrowSettled: string[];
  escrowErrors: Array<{ taskId: string; message: string }>;
  errors: Array<{ taskId: string; message: string }>;
  duplicateRun?: boolean;
}

export interface SyncRunOptions {
  /**
   * Optional dedupe key. When provided, a `ProcessedJob` row is claimed first so
   * overlapping scheduler invocations (same key) become no-ops. Callers that
   * need to force a run (tests, manual ops) simply omit it.
   */
  dedupeKey?: string;
}

function classify(result: OnchainReceiptResult): "confirmed" | "failed" | "skipped" {
  if (result.confirmed) return "confirmed";
  if (result.attempted && result.txHashes.length === 0) return "failed";
  if (!result.attempted) return "skipped";
  return "failed";
}

function emptyResult(startedAt: Date, duplicateRun = false): SyncRunResult {
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    durationMs: 0,
    scanned: 0,
    confirmed: 0,
    failed: 0,
    skipped: 0,
    staleRefunded: [],
    escrowSettled: [],
    escrowErrors: [],
    errors: [],
    ...(duplicateRun ? { duplicateRun: true } : {}),
  };
}

let inFlight: Promise<SyncRunResult> | null = null;

/**
 * Reconcile pending on-chain receipts, settled escrow settlement and time out
 * stale payments/tasks.
 *
 * Idempotent by construction:
 *  - concurrent invocations are coalesced via an in-flight guard;
 *  - `syncTaskReceipt` returns early for tasks already CONFIRMED;
 *  - stale tasks are selected only while PAID/PROCESSING, so they are not
 *    re-processed after being marked FAILED;
 *  - escrow settlement (on-chain release/refund) and refunds are idempotent in
 *    the escrow service.
 * Safe to run repeatedly from a scheduler.
 */
export async function runReceiptSync(
  options: SyncRunOptions = {},
): Promise<SyncRunResult> {
  if (inFlight) return inFlight;
  inFlight = runReceiptSyncInternal(options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runReceiptSyncInternal(
  options: SyncRunOptions,
): Promise<SyncRunResult> {
  const startedAt = new Date();
  const config = getServerConfig();
  const repo = getRepository();

  if (options.dedupeKey) {
    const claimed = await repo.beginJob(options.dedupeKey, "sync-receipts");
    if (!claimed) {
      captureMessage("Receipt sync skipped: duplicate run", "info", {
        scope: "cron.sync-receipts",
        dedupeKey: options.dedupeKey,
      });
      return emptyResult(startedAt, true);
    }
  }

  const result = emptyResult(startedAt);

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

  try {
    const escrow = await reconcileSettledEscrows();
    result.escrowSettled = escrow.settled;
    result.escrowErrors = escrow.errors;
  } catch (error) {
    captureException(error, { scope: "cron.escrow-reconcile" });
  }

  const finishedAt = new Date();
  result.finishedAt = finishedAt.toISOString();
  result.durationMs = finishedAt.getTime() - startedAt.getTime();
  return result;
}
