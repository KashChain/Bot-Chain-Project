import type { AgentRecord } from "@/lib/repo";
import { formatToken } from "@/lib/utils";

export interface PublicAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  capabilities: string[];
  usageInstructions: string;
  endpoint: string;
  priceWei: string;
  priceFormatted: string;
  currency: string;
  ownerAddress: string;
  active: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toPublicAgent(agent: AgentRecord): PublicAgent {
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    capabilities: agent.capabilities,
    usageInstructions: agent.usageInstructions,
    endpoint: agent.endpoint,
    priceWei: agent.priceWei,
    priceFormatted: formatToken(agent.priceWei),
    currency: "BOT",
    ownerAddress: agent.ownerAddress,
    active: agent.active,
    featured: agent.featured,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}
