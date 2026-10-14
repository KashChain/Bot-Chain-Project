"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Coins, Trash2, Copy, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, Badge, Spinner } from "@/components/ui/feedback";
import { useWallet } from "@/components/wallet/WalletProvider";
import { formatToken } from "@/lib/utils";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  ownerAddress: string;
  rateLimit: number;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface PlanItem {
  id: string;
  name: string;
  description: string;
  priceWei: string;
  monthlyCreditsWei: string;
  periodDays: number;
  features: string[];
}

interface SubscriptionItem {
  id: string;
  planId: string;
  status: string;
  periodEnd: string;
}

function withOwner(path: string, owner: string | null): string {
  if (!owner) return path;
  return `${path}${path.includes("?") ? "&" : "?"}ownerAddress=${owner}`;
}

function toWei(value: string): string {
  const [whole, fraction = ""] = value.trim().split(".");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) {
    throw new Error("Enter a valid BOT amount");
  }
  const padded = fraction.padEnd(18, "0").slice(0, 18);
  return (BigInt(whole || "0") * BigInt(10) ** BigInt(18) + BigInt(padded || "0")).toString();
}

export function DevelopersClient() {
  const { sessionAddress, address, signIn, signingIn } = useWallet();
  const owner = useMemo(
    () => (sessionAddress ?? address ?? "").toLowerCase(),
    [sessionAddress, address],
  );

  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [balanceWei, setBalanceWei] = useState("0");
  const [newKeyName, setNewKeyName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      const [keysRes, creditsRes, subsRes] = await Promise.all([
        fetch(withOwner("/api/keys", owner)),
        fetch(withOwner("/api/credits", owner)),
        fetch(withOwner("/api/subscriptions", owner)),
      ]);
      const keysPayload = await keysRes.json();
      const creditsPayload = await creditsRes.json();
      const subsPayload = await subsRes.json();
      if (!keysRes.ok) throw new Error(keysPayload.error ?? "Failed to load keys");
      setKeys(keysPayload.keys ?? []);
      setBalanceWei(creditsPayload.balanceWei ?? "0");
      setPlans(subsPayload.plans ?? []);
      setSubscriptions(subsPayload.subscriptions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load developer data");
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    void load();
  }, [load]);

  const createKey = useCallback(async () => {
    if (!owner) return;
    setError(null);
    setNotice(null);
    setIssuedToken(null);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "Default key", ownerAddress: owner }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to create key");
      setIssuedToken(payload.key?.token ?? null);
      setNewKeyName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    }
  }, [owner, newKeyName, load]);

  const revokeKey = useCallback(
    async (id: string) => {
      if (!owner) return;
      setError(null);
      try {
        const response = await fetch(withOwner(`/api/keys/${id}`, owner), {
          method: "DELETE",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to revoke key");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke key");
      }
    },
    [owner, load],
  );

  const topUp = useCallback(async () => {
    if (!owner) return;
    setError(null);
    setNotice(null);
    try {
      const amountWei = toWei(topupAmount);
      const response = await fetch("/api/credits/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAddress: owner, amountWei }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Top-up failed");
      setNotice(`Credited ${topupAmount} BOT to your platform balance.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
    }
  }, [owner, topupAmount, load]);

  const subscribeTo = useCallback(
    async (planId: string) => {
      if (!owner) return;
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerAddress: owner, planId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Subscription failed");
        setNotice(`Subscribed to ${planId}. Credits granted for this period.`);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Subscription failed");
      }
    },
    [owner, load],
  );

  const copyToken = useCallback(async () => {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [issuedToken]);

  if (!owner) {
    return (
      <div className="container py-10">
        <Card>
          <CardHeader>
            <CardTitle>Developer access</CardTitle>
            <CardDescription>
              Connect and sign in with your wallet to manage API keys, credits and
              subscriptions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void signIn()} disabled={signingIn}>
              {signingIn ? <Spinner /> : <KeyRound size={16} />} Sign in with wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Developer console</h1>
        <p className="text-muted-foreground">
          Programmatic API keys, platform credits and subscriptions for{" "}
          <span className="font-mono text-sm">{owner}</span>
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {issuedToken ? (
        <Alert tone="warning" title="Copy your API key now">
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-black/40 px-2 py-1 font-mono text-xs">
              {issuedToken}
            </code>
            <Button size="sm" variant="outline" onClick={() => void copyToken()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound size={18} /> API keys
            </CardTitle>
            <CardDescription>
              Use <code>Authorization: Bearer &lt;key&gt;</code> against{" "}
              <code>/api/v1/*</code>. Keys are hashed at rest.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key name (e.g. production)"
                value={newKeyName}
                onChange={(event) => setNewKeyName(event.target.value)}
              />
              <Button onClick={() => void createKey()}>Create key</Button>
            </div>
            {loading ? <Spinner /> : null}
            <ul className="space-y-2">
              {keys.map((key) => (
                <li
                  key={key.id}
                  className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{key.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {key.keyPrefix} · {key.rateLimit}/window
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {key.revokedAt ? (
                      <Badge tone="danger">revoked</Badge>
                    ) : (
                      <Badge tone="success">active</Badge>
                    )}
                    {!key.revokedAt ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void revokeKey(key.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
              {keys.length === 0 && !loading ? (
                <li className="text-sm text-muted-foreground">No API keys yet.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins size={18} /> Credits
            </CardTitle>
            <CardDescription>Pay for tasks with platform credits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-semibold">{formatToken(balanceWei)} BOT</p>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.1"
                value={topupAmount}
                onChange={(event) => setTopupAmount(event.target.value)}
              />
              <Button onClick={() => void topUp()}>Top up</Button>
            </div>
            {subscriptions.length > 0 ? (
              <div className="pt-2">
                <p className="text-xs uppercase text-muted-foreground">Subscriptions</p>
                <ul className="mt-1 space-y-1">
                  {subscriptions.map((sub) => (
                    <li key={sub.id} className="flex items-center justify-between text-sm">
                      <span>{sub.planId}</span>
                      <Badge tone={sub.status === "ACTIVE" ? "success" : "default"}>
                        {sub.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>Monthly tiers with included platform credits.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-lg border border-border p-4">
                <p className="font-semibold">{plan.name}</p>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-2 text-sm">
                  {formatToken(plan.priceWei)} BOT / {plan.periodDays}d ·{" "}
                  {formatToken(plan.monthlyCreditsWei)} credits
                </p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  onClick={() => void subscribeTo(plan.id)}
                >
                  Subscribe
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
