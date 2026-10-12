import type { CreateAgentData } from "./repo/types";

export const BUILTIN_RESEARCH_SLUG = "ai-research-assistant";
export const BUILTIN_BLOCKCHAIN_SLUG = "blockchain-activity-analyst";

export const BUILTIN_AGENT_SLUGS = new Set([
  BUILTIN_RESEARCH_SLUG,
  BUILTIN_BLOCKCHAIN_SLUG,
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
];
