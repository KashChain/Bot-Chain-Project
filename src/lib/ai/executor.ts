import { AppError } from "../errors";
import { withSpan } from "../monitoring";
import type { AgentRecord } from "../repo/types";
import {
  BUILTIN_BLOCKCHAIN_SLUG,
  BUILTIN_DAO_RESEARCH_SLUG,
  BUILTIN_ONCHAIN_INTEL_SLUG,
  BUILTIN_RESEARCH_SLUG,
  BUILTIN_SMART_CONTRACT_SLUG,
  isBuiltinAgent,
} from "../seed-agents";
import { runBlockchainAnalyst } from "./blockchain-analyst";
import type { LlmMode } from "./llm";
import { runResearch } from "./research";
import { callExternalAgent } from "./webhook";

export type ExecutionMode = LlmMode | "webhook";

export interface ExecutionOutcome {
  output: unknown;
  mode: ExecutionMode;
  model: string | null;
}

export async function executeAgent(
  agent: AgentRecord,
  taskId: string,
  input: string,
): Promise<ExecutionOutcome> {
  if (
    agent.slug === BUILTIN_RESEARCH_SLUG ||
    agent.slug === BUILTIN_DAO_RESEARCH_SLUG
  ) {
    const { result, mode, model } = await runResearch(input);
    return { output: result, mode, model };
  }

  if (
    agent.slug === BUILTIN_BLOCKCHAIN_SLUG ||
    agent.slug === BUILTIN_SMART_CONTRACT_SLUG ||
    agent.slug === BUILTIN_ONCHAIN_INTEL_SLUG
  ) {
    const { result, mode, model } = await runBlockchainAnalyst(input);
    return { output: result, mode, model };
  }

  if (isBuiltinAgent(agent.slug)) {
    throw new AppError(
      `Built-in agent "${agent.slug}" has no executor registered`,
      500,
      "NO_EXECUTOR",
    );
  }

  if (!agent.endpoint) {
    throw new AppError(
      `Agent "${agent.slug}" has no endpoint configured`,
      500,
      "NO_ENDPOINT",
    );
  }

  const output = await withSpan(
    "agent.execute.external",
    () =>
      callExternalAgent(agent.endpoint, { taskId, input }, agent.webhookSecret ?? null),
    { agentId: agent.id, slug: agent.slug, taskId, signed: Boolean(agent.webhookSecret) },
  );
  return { output, mode: "webhook", model: null };
}
