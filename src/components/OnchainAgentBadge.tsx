"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/feedback";

interface OnchainState {
  configured: boolean;
  exists: boolean;
  active: boolean;
  error: string | null;
}

export function OnchainAgentBadge({ slug }: { slug: string }) {
  const [state, setState] = useState<OnchainState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/${encodeURIComponent(slug)}/onchain`)
      .then(async (response) => {
        if (!response.ok) throw new Error("request failed");
        const payload = (await response.json()) as { onchain: OnchainState };
        if (!cancelled) setState(payload.onchain);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (failed) {
    return <Badge tone="default">On-chain status unavailable</Badge>;
  }
  if (!state) {
    return <Badge tone="default">Checking on-chain status…</Badge>;
  }
  if (!state.configured) {
    return <Badge tone="default">On-chain registry off</Badge>;
  }
  if (!state.exists) {
    return (
      <Badge tone="danger" title={state.error ?? undefined}>
        Not registered on-chain
      </Badge>
    );
  }
  return (
    <Badge tone={state.active ? "success" : "warning"}>
      {state.active ? "Registered on-chain" : "Paused on-chain"}
    </Badge>
  );
}
