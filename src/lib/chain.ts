export const botChain = {
  chainId: Number(process.env.NEXT_PUBLIC_BOTCHAIN_TESTNET_CHAIN_ID ?? 968),
  name: process.env.NEXT_PUBLIC_BOTCHAIN_NAME ?? "BOT Chain Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_BOTCHAIN_RPC_URL ?? "https://rpc.bohr.life",
  explorerUrl:
    process.env.NEXT_PUBLIC_BOTCHAIN_EXPLORER_URL ?? "https://scan.bohr.life",
  currencySymbol: process.env.NEXT_PUBLIC_BOTCHAIN_CURRENCY_SYMBOL ?? "BOT",
  paymentRecipient: process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT ?? "",
} as const;

export const botChainIdHex = `0x${botChain.chainId.toString(16)}`;

export const botChainAddParams = {
  chainId: botChainIdHex,
  chainName: botChain.name,
  nativeCurrency: {
    name: botChain.currencySymbol,
    symbol: botChain.currencySymbol,
    decimals: 18,
  },
  rpcUrls: [botChain.rpcUrl],
  blockExplorerUrls: [botChain.explorerUrl],
};

export function isCorrectChain(chainId: number | null | undefined): boolean {
  return chainId === botChain.chainId;
}

export function explorerTxUrl(txHash: string): string {
  return `${botChain.explorerUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${botChain.explorerUrl}/address/${address}`;
}
