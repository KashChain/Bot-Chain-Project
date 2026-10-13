import "dotenv/config";
import { isSignerConfigured } from "../src/lib/contract";
import { registerAgentOnchain, type AgentRegistryInput } from "../src/lib/registry";
import { getRepository } from "../src/lib/repo";
import { SEED_AGENTS } from "../src/lib/seed-agents";

async function collectTargets(): Promise<AgentRegistryInput[]> {
  const targets: AgentRegistryInput[] = SEED_AGENTS.map((seed) => ({
    slug: seed.slug,
    metadataUri: seed.metadataUri ?? null,
  }));

  try {
    const repo = getRepository();
    const agents = await repo.listAgents({ activeOnly: false });
    for (const agent of agents) {
      if (!targets.some((target) => target.slug === agent.slug)) {
        targets.push({ slug: agent.slug, metadataUri: agent.metadataUri });
      }
    }
  } catch (error) {
    console.warn(
      `[registry:sync] Could not load repository agents (${error instanceof Error ? error.message : error}); syncing built-ins only.`,
    );
  }

  return targets;
}

async function main(): Promise<void> {
  if (!isSignerConfigured()) {
    console.error(
      "[registry:sync] AGENT_MARKETPLACE_CONTRACT_ADDRESS and DEPLOYER_PRIVATE_KEY must be set.",
    );
    process.exit(1);
  }

  const targets = await collectTargets();
  let failures = 0;

  for (const target of targets) {
    try {
      const result = await registerAgentOnchain(target);
      const action = result.alreadyRegistered ? "already registered" : "registered";
      const tx = result.txHashes.length ? ` tx=${result.txHashes.join(",")}` : "";
      console.log(`[registry:sync] ${target.slug}: ${action}${tx}`);
    } catch (error) {
      failures += 1;
      console.error(
        `[registry:sync] ${target.slug}: FAILED - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`[registry:sync] ${failures} agent(s) failed.`);
    process.exit(1);
  }
}

void main();
