"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useWallet, botChain } from "@/components/wallet/WalletProvider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/feedback";
import { AGENT_CATEGORIES } from "@/lib/validation";
import { isCorrectChain } from "@/lib/chain";

function botToWei(bot: string): string | null {
  if (!/^\d+(\.\d{0,18})?$/.test(bot)) return null;
  const [whole, fraction = ""] = bot.split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  try {
    return (BigInt(whole) * BigInt("1000000000000000000") + BigInt(padded)).toString();
  } catch {
    return null;
  }
}

export function RegisterClient() {
  const { address, chainId, hasProvider, connect } = useWallet();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    category: AGENT_CATEGORIES[0] as string,
    capabilities: "",
    usageInstructions: "",
    endpoint: "https://",
    price: "0.01",
    metadataUri: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  async function submit() {
    setError(null);
    if (!address) {
      setError("Connect your wallet first: the connected address becomes the agent owner.");
      return;
    }
    const priceWei = botToWei(form.price);
    if (!priceWei) {
      setError("Price must be a valid number of BOT with up to 18 decimals.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || autoSlug(form.name),
          description: form.description,
          category: form.category,
          capabilities: form.capabilities
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          usageInstructions: form.usageInstructions,
          endpoint: form.endpoint,
          priceWei,
          ownerAddress: address,
          metadataUri: form.metadataUri || undefined,
        }),
      });
      const payload = (await response.json()) as {
        agent?: { slug: string };
        error?: string;
        issues?: { path: string; message: string }[];
      };
      if (!response.ok) {
        const detail =
          payload.issues?.map((issue) => `${issue.path}: ${issue.message}`).join("; ") ??
          payload.error ??
          "Registration failed";
        throw new Error(detail);
      }
      setCreatedSlug(payload.agent?.slug ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (createdSlug) {
    return (
      <div className="container py-12">
        <Alert tone="success" title="Agent registered">
          <p className="mt-1">Your agent metadata was saved.</p>
          <div className="mt-3 flex gap-2">
            <Link href={`/agents/${createdSlug}`}>
              <Button size="sm">View agent</Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreatedSlug(null);
                setForm((prev) => ({ ...prev, name: "", slug: "" }));
              }}
            >
              Register another
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold">Register an agent</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Register an agent so others can discover and pay for it. Metadata you
        submit (name, description, category, endpoint, price) is public and may
        be visible to anyone. Never enter private keys or seed phrases anywhere
        on this site.
      </p>

      <div className="mt-6 max-w-3xl">
        {!hasProvider ? (
          <Alert tone="warning" title="No wallet detected">
            Install an EVM wallet to register an agent.
          </Alert>
        ) : !address ? (
          <Alert tone="info" title="Connect your wallet">
            <p className="mt-1">
              The connected wallet becomes the agent owner.
            </p>
            <Button className="mt-3" size="sm" onClick={() => void connect()}>
              Connect wallet
            </Button>
          </Alert>
        ) : !isCorrectChain(chainId) ? (
          <Alert tone="warning" title="Not on BOT Chain">
            You are connected to chain {chainId}. Registration still works, but
            switch to {botChain.name} before running paid tasks.
          </Alert>
        ) : null}

        <div className="mt-6 space-y-5 rounded-lg border border-border bg-card/60 p-6">
          <Field label="Agent name">
            <Input
              value={form.name}
              onChange={(event) => {
                update("name", event.target.value);
                if (!form.slug) update("slug", autoSlug(event.target.value));
              }}
              placeholder="e.g. Market Sentiment Analyst"
            />
          </Field>

          <Field label="Slug (unique, lowercase-dashes)">
            <Input
              value={form.slug}
              onChange={(event) => update("slug", autoSlug(event.target.value))}
              placeholder="market-sentiment-analyst"
            />
          </Field>

          <Field label="Category">
            <Select
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
            >
              {AGENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="What does this agent do? At least 20 characters."
            />
          </Field>

          <Field label="Capabilities (comma separated)">
            <Input
              value={form.capabilities}
              onChange={(event) => update("capabilities", event.target.value)}
              placeholder="Sentiment scoring, Trend detection"
            />
          </Field>

          <Field label="Usage instructions">
            <Textarea
              value={form.usageInstructions}
              onChange={(event) => update("usageInstructions", event.target.value)}
              placeholder="How should a user phrase their task?"
            />
          </Field>

          <Field label="Endpoint (https URL)">
            <Input
              value={form.endpoint}
              onChange={(event) => update("endpoint", event.target.value)}
              placeholder="https://api.example.com/agent"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              External endpoints must be public https URLs. Private, loopback
              and cloud-metadata addresses are blocked by the server.
            </p>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price per task (BOT)">
              <Input
                value={form.price}
                onChange={(event) => update("price", event.target.value)}
                placeholder="0.01"
              />
            </Field>
            <Field label="Metadata URI (optional)">
              <Input
                value={form.metadataUri}
                onChange={(event) => update("metadataUri", event.target.value)}
                placeholder="ipfs://... or https://..."
              />
            </Field>
          </div>

          <Field label="Owner address (from your wallet)">
            <Input value={address ?? ""} readOnly disabled />
          </Field>

          {error ? <Alert tone="danger" title="Error">{error}</Alert> : null}

          <Button
            onClick={() => void submit()}
            disabled={submitting || !address}
          >
            {submitting ? <Spinner /> : <CheckCircle2 size={16} />}
            Register agent
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
