"use client";

import { useMemo, useState } from "react";
import { useWallet, botChain } from "@/components/wallet/WalletProvider";
import { ResultView } from "@/components/ResultView";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Alert, Badge, Spinner } from "@/components/ui/feedback";
import { isCorrectChain, explorerTxUrl } from "@/lib/chain";
import { formatToken, shortAddress } from "@/lib/utils";
import type { PublicAgent } from "@/lib/agents/public";
import type { ReceiptStatus } from "@/lib/receipt-state";
import type { PaymentInstructions, PublicTask } from "@/lib/tasks/types";

type Phase =
  | "idle"
  | "creating"
  | "confirm"
  | "paying"
  | "paid"
  | "running"
  | "done";

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

export function TaskRunner({ agent }: { agent: PublicAgent }) {
  const { address, chainId, hasProvider, connect, switchToBotChain, sendPayment } =
    useWallet();
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [task, setTask] = useState<PublicTask | null>(null);
  const [payment, setPayment] = useState<PaymentInstructions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const correctChain = isCorrectChain(chainId);
  const busy = ["creating", "paying", "running"].includes(phase);
  const canSubmit = useMemo(
    () => Boolean(address) && correctChain && input.trim().length >= 5,
    [address, correctChain, input],
  );

  async function api<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        (payload as { error?: string }).error ?? `Request failed (${response.status})`,
      );
    }
    return payload as T;
  }

  async function handleCreate() {
    if (!address) return;
    setError(null);
    setPhase("creating");
    try {
      const result = await api<{ task: PublicTask; payment: PaymentInstructions }>(
        "/api/tasks",
        { agentSlug: agent.slug, input, clientAddress: address },
      );
      setTask(result.task);
      setPayment(result.payment);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
      setPhase("idle");
    }
  }

  function mockTxHash(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return `0x${Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  async function handlePay() {
    if (!task || !payment) return;
    setError(null);
    setPhase("paying");
    try {
      let txHash: string;
      if (payment.mode === "mock") {
        txHash = mockTxHash();
      } else {
        if (!payment.recipient) {
          throw new Error(
            "The server has no payment recipient configured (NEXT_PUBLIC_PAYMENT_RECIPIENT).",
          );
        }
        txHash = await sendPayment({
          to: payment.recipient,
          amountWei: payment.amountWei,
        });
      }
      const result = await api<{ task: PublicTask }>(
        `/api/tasks/${task.id}/payment`,
        { txHash },
      );
      setTask(result.task);
      setPhase("paid");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Payment was rejected or failed";
      setError(message);
      setPhase("confirm");
    }
  }

  async function handleRun() {
    if (!task) return;
    setError(null);
    setPhase("running");
    try {
      const result = await api<{ task: PublicTask }>(
        `/api/tasks/${task.id}/execute`,
        {},
      );
      setTask(result.task);
      setPhase(result.task.status === "COMPLETED" ? "done" : "paid");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent execution failed");
      setPhase("paid");
    }
  }

  function reset() {
    setInput("");
    setTask(null);
    setPayment(null);
    setError(null);
    setPhase("idle");
  }

  return (
    <div id="run" className="card-glow rounded-lg border border-border bg-card p-6">
      <h3 className="text-lg font-semibold">Run this agent</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Estimated cost:{" "}
        <span className="font-medium text-foreground">
          {agent.priceFormatted} {agent.currency}
        </span>{" "}
        per task. You approve the payment in your wallet before anything runs.
      </p>

      {!hasProvider ? (
        <Alert tone="warning" className="mt-4" title="No wallet detected">
          <p>
            Install an EVM wallet (MetaMask, OKX, Bitget or TokenPocket) to run
            tasks.
          </p>
        </Alert>
      ) : null}

      {hasProvider && !address ? (
        <Alert tone="info" className="mt-4" title="Connect your wallet">
          <p className="mt-1">Connect a wallet to create and pay for a task.</p>
          <Button className="mt-3" size="sm" onClick={() => void connect()}>
            Connect wallet
          </Button>
        </Alert>
      ) : null}

      {address && !correctChain ? (
        <Alert tone="danger" className="mt-4" title="Wrong network">
          <p className="mt-1">
            Switch to {botChain.name} (chain ID {botChain.chainId}) to continue.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="mt-3"
            onClick={() => void switchToBotChain()}
          >
            Switch network
          </Button>
        </Alert>
      ) : null}

      {phase === "idle" || phase === "creating" ? (
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="task-input">Your task</Label>
            <Textarea
              id="task-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                agent.slug === "blockchain-activity-analyst"
                  ? "Paste a BOT Chain address or transaction hash and ask a question."
                  : "Describe your research question."
              }
              maxLength={4000}
            />
            <p className="text-xs text-muted-foreground">
              {input.length}/4000 characters. The prompt is sent to the server
              only; it is not written on-chain.
            </p>
          </div>
          <Button
            onClick={() => void handleCreate()}
            disabled={!canSubmit || busy}
          >
            {phase === "creating" ? <Spinner /> : null}
            Continue to payment
          </Button>
        </div>
      ) : null}

      {phase === "confirm" || phase === "paying" ? (
        <div className="mt-4 space-y-4">
          <Alert tone="info" title="Confirm payment">
            <ul className="mt-2 space-y-1">
              <li>
                Purpose: task for <strong>{agent.name}</strong>
              </li>
              <li>
                Amount:{" "}
                <strong>
                  {payment?.amountFormatted}{" "}
                  {payment?.currency}
                </strong>
              </li>
              <li>
                Recipient:{" "}
                <strong>
                  {payment?.recipient
                    ? shortAddress(payment.recipient, 6)
                    : "not configured"}
                </strong>
              </li>
              <li>
                Network: {botChain.name} (chain ID {payment?.chainId})
              </li>
              <li>Task ID: {task?.id}</li>
            </ul>
          </Alert>
          {payment?.mode === "mock" ? (
            <Alert tone="warning" title="Mock payment mode">
              <p>
                The server is set to mock payments. No real testnet transaction
                is sent. This is for development only.
              </p>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handlePay()} disabled={busy}>
              {phase === "paying" ? <Spinner /> : null}
              {payment?.mode === "mock"
                ? "Simulate payment"
                : "Authorize payment in wallet"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "paid" || phase === "running" || phase === "done" ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="success">Paid</Badge>
            {task?.paymentTxHash ? (
              <span className="text-muted-foreground">
                Payment tx:{" "}
                {task.paymentTxHash.startsWith("0x") && task.paymentTxHash.length === 66 ? (
                  <a
                    className="underline hover:text-foreground"
                    href={explorerTxUrl(task.paymentTxHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddress(task.paymentTxHash, 6)}
                  </a>
                ) : (
                  shortAddress(task.paymentTxHash, 6)
                )}
              </span>
            ) : null}
          </div>

          <Button onClick={() => void handleRun()} disabled={busy}>
            {phase === "running" ? <Spinner /> : null}
            {phase === "running" ? "Agent is working..." : "Run agent"}
          </Button>

          {task?.status === "COMPLETED" && task.result ? (
            <div className="mt-2">
              <ResultView result={task.result} />
            </div>
          ) : null}

          {task?.status === "COMPLETED" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">On-chain receipt:</span>
              <Badge tone={RECEIPT_TONE[task.receiptStatus]}>
                {task.receiptStatus}
              </Badge>
              {task.onchainTxHash ? (
                <a
                  className="underline hover:text-foreground"
                  href={explorerTxUrl(task.onchainTxHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(task.onchainTxHash, 6)}
                </a>
              ) : null}
            </div>
          ) : null}

          {task?.status === "COMPLETED" && task.receiptStatus === "FAILED" ? (
            <Alert tone="warning" title="On-chain receipt pending">
              <p className="mt-1">
                The task result is saved and safe, but the on-chain receipt
                could not be recorded. It can be retried later.
              </p>
              {task.receiptError ? (
                <p className="mt-1 text-xs">{task.receiptError}</p>
              ) : null}
            </Alert>
          ) : null}

          {task?.resultHash ? (
            <p className="break-all text-xs text-muted-foreground">
              Result hash (SHA-256): {task.resultHash}
            </p>
          ) : null}

          {phase === "done" ? (
            <Button variant="outline" onClick={reset}>
              Start another task
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-4" title="Error">
          <p className="mt-1">{error}</p>
        </Alert>
      ) : null}

      {address && correctChain ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Connected as {shortAddress(address, 6)} on chain {chainId}. Price
          shown is for one task ({formatToken(agent.priceWei)} {agent.currency}).
        </p>
      ) : null}
    </div>
  );
}
