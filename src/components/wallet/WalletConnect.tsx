"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { useWallet, botChain } from "@/components/wallet/WalletProvider";
import { isCorrectChain } from "@/lib/chain";
import { shortAddress } from "@/lib/utils";

export function WalletConnect() {
  const {
    address,
    sessionAddress,
    chainId,
    hasProvider,
    connecting,
    signingIn,
    error,
    connect,
    switchToBotChain,
    signIn,
    signOut,
  } = useWallet();
  const [switching, setSwitching] = useState(false);

  if (!hasProvider) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={connect}
        title="Install an EVM wallet such as MetaMask, OKX, Bitget or TokenPocket"
      >
        Install wallet
      </Button>
    );
  }

  if (!address) {
    return (
      <Button size="sm" onClick={connect} disabled={connecting}>
        {connecting ? "Connecting..." : "Connect wallet"}
      </Button>
    );
  }

  const correct = isCorrectChain(chainId);

  return (
    <div className="flex items-center gap-2">
      {correct ? (
        <Badge tone="success">{botChain.name}</Badge>
      ) : (
        <Button
          variant="destructive"
          size="sm"
          disabled={switching}
          onClick={async () => {
            setSwitching(true);
            try {
              await switchToBotChain();
            } catch (err) {
              console.error("Failed to switch network", err);
            } finally {
              setSwitching(false);
            }
          }}
        >
          {switching ? "Switching..." : "Switch to BOT Chain"}
        </Button>
      )}
      <Badge tone="info">{shortAddress(address)}</Badge>
      {sessionAddress ? (
        <button
          type="button"
          onClick={signOut}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Sign out
        </button>
      ) : (
        <Button size="sm" variant="outline" onClick={signIn} disabled={signingIn}>
          {signingIn ? "Signing in..." : "Sign in"}
        </Button>
      )}
      {error ? (
        <span className="hidden text-xs text-destructive md:inline">
          {error}
        </span>
      ) : null}
    </div>
  );
}
