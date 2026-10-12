import { publicConfig } from "./config";

export function explorerTxUrl(txHash: string): string {
  return `${publicConfig.NEXT_PUBLIC_BOTCHAIN_EXPLORER_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${publicConfig.NEXT_PUBLIC_BOTCHAIN_EXPLORER_URL}/address/${address}`;
}
