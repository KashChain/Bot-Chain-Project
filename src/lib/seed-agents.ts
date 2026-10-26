import type { CreateAgentData } from "./repo/types";

export const BUILTIN_RESEARCH_SLUG = "ai-research-assistant";
export const BUILTIN_BLOCKCHAIN_SLUG = "blockchain-activity-analyst";
export const BUILTIN_DAO_RESEARCH_SLUG = "dao-research-agent";
export const BUILTIN_SMART_CONTRACT_SLUG = "smart-contract-analysis-agent";
export const BUILTIN_ONCHAIN_INTEL_SLUG = "on-chain-intelligence-agent";

export const BUILTIN_AGENT_SLUGS = new Set([
  BUILTIN_RESEARCH_SLUG,
  BUILTIN_BLOCKCHAIN_SLUG,
  BUILTIN_DAO_RESEARCH_SLUG,
  BUILTIN_SMART_CONTRACT_SLUG,
  BUILTIN_ONCHAIN_INTEL_SLUG,
]);

export function isBuiltinAgent(slug: string): boolean {
  return BUILTIN_AGENT_SLUGS.has(slug);
}

const ONE_BOT_WEI = "1000000000000000000";

export function botToWei(bot: number): string {
  const [whole, fraction = ""] = bot.toString().split(".");
  const padded = `${fraction}000000000000000000`.slice(0, 18);
  return (BigInt(whole) * BigInt(ONE_BOT_WEI) + BigInt(padded)).toString();
}

export const SEED_AGENTS: CreateAgentData[] = [
  {
    slug: BUILTIN_RESEARCH_SLUG,
    name: "AI Research Assistant",
    description:
      "Takes a research question and returns a structured summary, key findings, and explicit caveats. Runs server-side against a configured LLM provider and never exposes your API keys to the browser.",
    category: "Research",
    capabilities: [
      "Structured summaries",
      "Key findings",
      "Caveats & uncertainty",
    ],
    usageInstructions:
      "Enter a focused research question (for example, 'What are the trade-offs of optimistic vs zk rollups?'). The agent returns a summary, a list of key findings, and the caveats you should independently verify.",
    endpoint: "https://agenthub.local/builtin/ai-research-assistant",
    priceWei: botToWei(0.01),
    ownerAddress: "0x0000000000000000000000000000000000000000",
    metadataUri: "builtin://ai-research-assistant",
    featured: true,
  },
  {
    slug: BUILTIN_BLOCKCHAIN_SLUG,
    name: "Blockchain Activity Analyst",
    description:
      "Accepts a BOT Chain address or transaction hash plus a question. Fetches public on-chain data from the configured RPC and clearly separates verified on-chain facts from AI-generated interpretation.",
    category: "Blockchain Analytics",
    capabilities: [
      "Address balance lookup",
      "Transaction lookup",
      "Verified facts vs interpretation",
    ],
    usageInstructions:
      "Provide a 0x address or 0x transaction hash and a question. The agent reads public data from the BOT Chain RPC and labels every statement as either a verified on-chain fact or an interpretation.",
    endpoint: "https://agenthub.local/builtin/blockchain-activity-analyst",
    priceWei: botToWei(0.02),
    ownerAddress: "0x0000000000000000000000000000000000000000",
    metadataUri: "builtin://blockchain-activity-analyst",
    featured: true,
  },
  {
    slug: BUILTIN_DAO_RESEARCH_SLUG,
    name: "DAO Research Agent",
    description:
      "Specialized in decentralized autonomous organization governance, proposal analysis, voting trends, and treasury allocations for DAOs.",
    category: "Research",
    capabilities: [
      "Governance proposal analysis",
      "Voting trend tracking",
      "Treasury allocation reviews",
    ],
    usageInstructions:
      "Provide a DAO name, proposal identifier, or governance question (e.g. 'Analyze the trade-offs of Proposal #42 on treasury diversification'). The agent returns a structured breakdown of voter distribution, key arguments, and governance risks.",
    endpoint: "https://agenthub.local/builtin/dao-research-agent",
    priceWei: botToWei(0.01),
    ownerAddress: "0x0000000000000000000000000000000000000000",
    metadataUri: "builtin://dao-research-agent",
    featured: true,
  },
  {
    slug: BUILTIN_SMART_CONTRACT_SLUG,
    name: "Smart Contract Analysis Agent",
    description:
      "Inspects deployed EVM smart contracts on BOT Chain, analyzing bytecode, function signatures, verified source artifacts, and known vulnerability vectors.",
    category: "Blockchain Analytics",
    capabilities: [
      "Bytecode & ABI decompilation",
      "Vulnerability vector scanning",
      "Access control & privilege auditing",
    ],
    usageInstructions:
      "Provide a smart contract address on BOT Chain (0x...) and an audit scope. The agent inspects on-chain bytecode, analyzes public interfaces, and highlights potential security concerns or reentrancy vectors.",
    endpoint: "https://agenthub.local/builtin/smart-contract-analysis-agent",
    priceWei: botToWei(0.02),
    ownerAddress: "0x0000000000000000000000000000000000000000",
    metadataUri: "builtin://smart-contract-analysis-agent",
    featured: true,
  },
  {
    slug: BUILTIN_ONCHAIN_INTEL_SLUG,
    name: "On-Chain Intelligence Agent",
    description:
      "Delivers surveillance across BOT Chain on-chain flows, liquidity movements, whale wallet interactions, and transaction volume anomalies.",
    category: "Blockchain Analytics",
    capabilities: [
      "Whale wallet tracking",
      "Liquidity pool flow surveillance",
      "Volume & anomaly detection",
    ],
    usageInstructions:
      "Submit a wallet address, pool address, or transaction block range. The agent correlates on-chain transfers, detects unusual token movements, and provides structured intelligence summaries.",
    endpoint: "https://agenthub.local/builtin/on-chain-intelligence-agent",
    priceWei: botToWei(0.015),
    ownerAddress: "0x0000000000000000000000000000000000000000",
    metadataUri: "builtin://on-chain-intelligence-agent",
    featured: true,
  },
];
