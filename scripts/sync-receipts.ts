import "dotenv/config";
import { isOnchainReceiptConfigured } from "../src/lib/contract";
import { getRepository } from "../src/lib/repo";
import { syncTaskReceipt } from "../src/lib/tasks/service";

function parseArgs(argv: string[]): { ids: string[]; all: boolean } {
  return {
    ids: argv.filter((arg) => !arg.startsWith("--")),
    all: argv.includes("--all"),
  };
}

async function main(): Promise<void> {
  if (!isOnchainReceiptConfigured()) {
    console.error(
      "[receipt:sync] AGENT_MARKETPLACE_CONTRACT_ADDRESS and DEPLOYER_PRIVATE_KEY must be set.",
    );
    process.exit(1);
  }

  const { ids, all } = parseArgs(process.argv.slice(2));
  let taskIds = ids;

  if (taskIds.length === 0) {
    if (!all) {
      console.error(
        "[receipt:sync] Pass one or more task ids, or --all to retry every unconfirmed receipt.",
      );
      process.exit(1);
    }
    const repo = getRepository();
    const tasks = await repo.listUnconfirmedReceiptTasks();
    taskIds = tasks.map((task) => task.id);
  }

  if (taskIds.length === 0) {
    console.log("[receipt:sync] No tasks with unconfirmed receipts.");
    return;
  }

  let failures = 0;
  for (const taskId of taskIds) {
    try {
      const result = await syncTaskReceipt(taskId);
      const tx = result.txHashes.length ? ` tx=${result.txHashes.join(",")}` : "";
      console.log(
        `[receipt:sync] ${taskId}: ${result.confirmed ? "CONFIRMED" : "FAILED"}${tx}${
          result.error ? ` (${result.error})` : ""
        }`,
      );
      if (!result.confirmed) failures += 1;
    } catch (error) {
      failures += 1;
      console.error(
        `[receipt:sync] ${taskId}: FAILED - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`[receipt:sync] ${failures} task(s) still unconfirmed.`);
    process.exit(1);
  }
}

void main();
