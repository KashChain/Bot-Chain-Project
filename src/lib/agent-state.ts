export const AGENT_STATUSES = ["ACTIVE", "SUSPENDED", "BANNED"] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

export function isAgentActive(status: AgentStatus): boolean {
  return status === "ACTIVE";
}
