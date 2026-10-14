import type { AgentRecord } from "@/lib/repo";
import type { AgentStatus } from "@/lib/agent-state";
import type { StakeStatus } from "@/lib/escrow-state";
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
  status: AgentStatus;
  verified: boolean;
  stakedWei: string;
  stakedFormatted: string;
  stakeStatus: StakeStatus | null;
  ratingAverage: number;
  ratingCount: number;
  completedTaskCount: number;
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
    status: agent.status,
    verified: agent.verified,
    stakedWei: agent.stakedWei ?? "0",
    stakedFormatted: formatToken(agent.stakedWei ?? "0"),
    stakeStatus: agent.stakeStatus ?? null,
    ratingAverage: agent.ratingAverage ?? 0,
    ratingCount: agent.ratingCount ?? 0,
    completedTaskCount: agent.completedTaskCount ?? 0,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}
