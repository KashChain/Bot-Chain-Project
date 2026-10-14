"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Coins, RefreshCw } from "lucide-react";
import { useWallet, botChain } from "@/components/wallet/WalletProvider";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Spinner } from "@/components/ui/feedback";
import { isCorrectChain, explorerTxUrl } from "@/lib/chain";
import { formatDate, formatToken, shortAddress } from "@/lib/utils";
import type { PublicTask } from "@/lib/tasks/types";
import type { ReceiptStatus } from "@/lib/receipt-state";

interface CreatorEarnings {
  availableWei: string;
  releasedNetWei: string;
  lockedNetWei: string;
  paidOutWei: string;
}

const DISPUTABLE: PublicTask["status"][] = [
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
];
import type { TaskStatus } from "@/lib/task-state";

const STATUS_TONE: Record<
  TaskStatus,
  React.ComponentProps<typeof Badge>["tone"]
> = {
  CREATED: "default",
  PAYMENT_PENDING: "warning",
  PAID: "info",
  PROCESSING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "default",
  DISPUTED: "warning",
  REFUND_REQUESTED: "warning",
  REFUNDED: "info",
};

const RECEIPT_TONE: Record<
  ReceiptStatus,
  React.ComponentProps<typeof Badge>["tone"]
> = {
  NONE: "default",
  SKIPPED: "default",
  PENDING: "warning",
  CONFIRMED: "success",
  FAILED: "danger",
};

export function DashboardClient() {
  const { address, chainId, hasProvider, connect } = useWallet();
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [earnings, setEarnings] = useState<CreatorEarnings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [tasksResponse, earningsResponse] = await Promise.all([
        fetch(`/api/tasks?clientAddress=${encodeURIComponent(address)}`),
        fetch(`/api/creators/earnings?ownerAddress=${encodeURIComponent(address)}`),
      ]);
      const payload = (await tasksResponse.json()) as {
        tasks?: PublicTask[];
        error?: string;
      };
      if (!tasksResponse.ok) {
        throw new Error(payload.error ?? "Failed to load tasks");
      }
      setTasks(payload.tasks ?? []);

      const earningsPayload = (await earningsResponse.json()) as {
        earnings?: CreatorEarnings;
      };
      setEarnings(earningsPayload.earnings ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [address]);

  const openDispute = useCallback(
    async (taskId: string) => {
      const reason = window.prompt("Describe the issue with this task:");
      if (!reason) return;
      try {
        const response = await fetch(`/api/tasks/${taskId}/dispute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Failed to open dispute");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to open dispute");
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="container py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Your submitted tasks, payment status and on-chain receipts.
          </p>
        </div>
        {address ? (
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </Button>
        ) : null}
      </div>

      {!hasProvider ? (
        <Alert tone="warning" className="mt-6" title="No wallet detected">
          Install an EVM wallet to view your tasks.
        </Alert>
      ) : !address ? (
        <Alert tone="info" className="mt-6" title="Connect your wallet">
          <p className="mt-1">Connect a wallet to load your tasks.</p>
          <Button className="mt-3" size="sm" onClick={() => void connect()}>
            Connect wallet
          </Button>
        </Alert>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge tone="info">Wallet {shortAddress(address, 6)}</Badge>
            <Badge tone={isCorrectChain(chainId) ? "success" : "danger"}>
              Chain {chainId ?? "unknown"}
            </Badge>
            {!isCorrectChain(chainId) ? (
              <span>
                Expected {botChain.name} (chain {botChain.chainId}).
              </span>
            ) : null}
          </div>

          {earnings ? (
            <div className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
              <div>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Coins size={13} /> Available
                </p>
                <p className="mt-1 font-semibold">
                  {formatToken(earnings.availableWei)} BOT
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Released (net)</p>
                <p className="mt-1 font-semibold">
                  {formatToken(earnings.releasedNetWei)} BOT
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Escrowed</p>
                <p className="mt-1 font-semibold">
                  {formatToken(earnings.lockedNetWei)} BOT
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid out</p>
                <p className="mt-1 font-semibold">
                  {formatToken(earnings.paidOutWei)} BOT
                </p>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="mt-8 flex items-center gap-3 text-muted-foreground">
              <Spinner /> Loading your tasks...
            </div>
          ) : error ? (
            <Alert tone="danger" className="mt-8" title="Error">
              <p className="mt-1">{error}</p>
            </Alert>
          ) : tasks.length === 0 ? (
            <Alert tone="warning" className="mt-8" title="No tasks yet">
              <p className="mt-1">
                Start by exploring agents and running a task.
              </p>
              <Link href="/explore" className="mt-3 inline-block">
                <Button size="sm">Explore agents</Button>
              </Link>
            </Alert>
          ) : (
            <div className="mt-8 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Result hash</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {task.agentName ?? task.agentSlug}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {task.inputPreview}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[task.status]}>
                          {task.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {task.paymentTxHash ? (
                          task.paymentTxHash.length === 66 ? (
                            <a
                              className="underline hover:text-foreground"
                              href={explorerTxUrl(task.paymentTxHash)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {shortAddress(task.paymentTxHash, 4)}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              mock
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">unpaid</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={RECEIPT_TONE[task.receiptStatus]}>
                          {task.receiptStatus}
                        </Badge>
                        {task.onchainTxHash ? (
                          <a
                            className="mt-1 block text-xs underline hover:text-foreground"
                            href={explorerTxUrl(task.onchainTxHash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {shortAddress(task.onchainTxHash, 4)}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">
                          {task.resultHash
                            ? `${task.resultHash.slice(0, 14)}...`
                            : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(task.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {DISPUTABLE.includes(task.status) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openDispute(task.id)}
                          >
                            Dispute
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
