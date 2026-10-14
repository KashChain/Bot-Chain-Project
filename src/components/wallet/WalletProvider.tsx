"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BrowserProvider } from "ethers";
import { botChain, botChainAddParams, botChainIdHex } from "@/lib/chain";
import { buildSiweMessage } from "@/lib/auth/siwe";

interface Eip1193Provider {
  request(args: {
    method: string;
    params?: unknown[] | object;
  }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

interface WalletContextValue {
  address: string | null;
  sessionAddress: string | null;
  chainId: number | null;
  hasProvider: boolean;
  connecting: boolean;
  signingIn: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToBotChain: () => Promise<void>;
  sendPayment: (params: { to: string; amountWei: string }) => Promise<string>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasProvider =
    typeof window !== "undefined" && typeof window.ethereum !== "undefined";

  const refreshChain = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const hex = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      setChainId(Number.parseInt(hex, 16));
    } catch {
      setChainId(null);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError(
        "No EVM wallet detected. Install MetaMask, OKX, Bitget or TokenPocket.",
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts.length > 0) setAddress(accounts[0]);
      await refreshChain();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Wallet connection was rejected",
      );
    } finally {
      setConnecting(false);
    }
  }, [refreshChain]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  const switchToBotChain = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: botChainIdHex }],
      });
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902 || code === -32603) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [botChainAddParams],
        });
      } else {
        throw err;
      }
    }
    await refreshChain();
  }, [refreshChain]);

  const sendPayment = useCallback(
    async ({ to, amountWei }: { to: string; amountWei: string }) => {
      if (!window.ethereum) throw new Error("No EVM wallet detected");
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to,
        value: BigInt(amountWei),
      });
      return tx.hash;
    },
    [],
  );

  const signIn = useCallback(async () => {
    if (!window.ethereum) {
      setError("No EVM wallet detected. Install MetaMask, OKX, Bitget or TokenPocket.");
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const account = accounts[0];
      if (!account) throw new Error("No wallet account selected");
      setAddress(account);

      const nonceResponse = await fetch(
        `/api/auth/nonce?address=${encodeURIComponent(account)}`,
      );
      const noncePayload = (await nonceResponse.json()) as {
        nonce?: string;
        error?: string;
      };
      if (!nonceResponse.ok || !noncePayload.nonce) {
        throw new Error(noncePayload.error ?? "Failed to obtain sign-in nonce");
      }

      const message = buildSiweMessage({
        domain: window.location.host,
        address: account,
        uri: window.location.origin,
        chainId: chainId ?? botChain.chainId,
        nonce: noncePayload.nonce,
        statement: "Sign in to AgentHub AI to publish agents and leave reviews.",
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, account],
      })) as string;

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const verifyPayload = (await verifyResponse.json()) as {
        address?: string;
        error?: string;
      };
      if (!verifyResponse.ok || !verifyPayload.address) {
        throw new Error(verifyPayload.error ?? "Wallet sign-in failed");
      }
      setSessionAddress(verifyPayload.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }, [chainId]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors on sign-out
    }
    setSessionAddress(null);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((payload: { address?: string | null }) => {
        if (payload.address) setSessionAddress(payload.address);
      })
      .catch(() => {
        // session endpoint may be unconfigured; ignore
      });
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    void refreshChain();

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setAddress(accounts && accounts.length > 0 ? accounts[0] : null);
    };
    const onChainChanged = (...args: unknown[]) => {
      const hex = args[0] as string | undefined;
      if (hex) setChainId(Number.parseInt(hex, 16));
    };

    window.ethereum.on?.("accountsChanged", onAccountsChanged);
    window.ethereum.on?.("chainChanged", onChainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
  }, [refreshChain]);

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      sessionAddress,
      chainId,
      hasProvider,
      connecting,
      signingIn,
      error,
      connect,
      disconnect,
      switchToBotChain,
      sendPayment,
      signIn,
      signOut,
    }),
    [
      address,
      sessionAddress,
      chainId,
      hasProvider,
      connecting,
      signingIn,
      error,
      connect,
      disconnect,
      switchToBotChain,
      sendPayment,
      signIn,
      signOut,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

export { botChain };
