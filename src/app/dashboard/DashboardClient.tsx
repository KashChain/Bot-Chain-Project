"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useWallet, botChain } from "@/components/wallet/WalletProvider";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Spinner } from "@/components/ui/feedback";
import { isCorrectChain, explorerTxUrl } from "@/lib/chain";
import { formatDate, shortAddress } from "@/lib/utils";
import type { PublicTask } from "@/lib/tasks/types";
import type { ReceiptStatus } from "@/lib/receipt-state";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tasks?clientAddress=${encodeURIComponent(address)}`,
      );
      const payload = (await response.json()) as {
        tasks?: PublicTask[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Failed to load tasks");
      setTasks(payload.tasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [address]);

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
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Result hash</th>
                    <th className="px-4 py-3">Created</th>
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
