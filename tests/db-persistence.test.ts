import "dotenv/config";
import net from "net";
import { randomUUID } from "crypto";
import { afterAll, describe, expect, it } from "vitest";

async function isPortReachable(host: string, port: number, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

async function checkDatabaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const url = new URL(process.env.DATABASE_URL);
    const host = url.hostname || "127.0.0.1";
    const port = Number(url.port) || 5432;
    return await isPortReachable(host, port, 1500);
  } catch {
    return false;
  }
}

const canReachDb = await checkDatabaseReachable();

describe.skipIf(!canReachDb)("prisma persistence", () => {
  const createdAgentSlugs: string[] = [];

  afterAll(async () => {
    const { getPrismaClient } = await import("@/lib/prisma");
    const prisma = await getPrismaClient();
    const agents = await prisma.agent.findMany({
      where: { slug: { in: createdAgentSlugs } },
    });
    for (const agent of agents) {
      await prisma.task.deleteMany({ where: { agentId: agent.id } });
      await prisma.agent.delete({ where: { id: agent.id } });
    }
  });

  it("round-trips a task and its receipt status through PostgreSQL", async () => {
    const { getPrismaRepository } = await import("@/lib/repo/prisma");
    const repo = getPrismaRepository();
    const slug = `db-test-${randomUUID()}`;
    createdAgentSlugs.push(slug);

    const agent = await repo.createAgent({
      slug,
      name: "DB Test Agent",
      description: "Agent created by the persistence test.",
      category: "Research",
      capabilities: ["test"],
      usageInstructions: "No-op",
      endpoint: "https://example.com/agent",
      priceWei: "10000000000000000",
      ownerAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(agent.id).toBeTruthy();

    const task = await repo.createTask({
      agentId: agent.id,
      clientAddress: "0x2222222222222222222222222222222222222222",
      input: "persist me",
      inputHash: "0xhash",
      priceWei: agent.priceWei,
    });
    expect(task.receiptStatus).toBe("NONE");

    await repo.updateTask(task.id, {
      status: "COMPLETED",
      resultHash: "0xresult",
      receiptStatus: "CONFIRMED",
      onchainTxHash: "0xtx",
      receiptAttempts: 1,
    });

    const reloaded = await repo.getTask(task.id);
    expect(reloaded?.status).toBe("COMPLETED");
    expect(reloaded?.receiptStatus).toBe("CONFIRMED");
    expect(reloaded?.onchainTxHash).toBe("0xtx");
    expect(reloaded?.receiptAttempts).toBe(1);

    const pending = await repo.listUnconfirmedReceiptTasks();
    expect(pending.find((row) => row.id === task.id)).toBeUndefined();

    const failed = await repo.createTask({
      agentId: agent.id,
      clientAddress: "0x2222222222222222222222222222222222222222",
      input: "receipt will fail",
      inputHash: "0xhash2",
      priceWei: agent.priceWei,
    });
    await repo.updateTask(failed.id, {
      status: "COMPLETED",
      resultHash: "0xresult2",
      receiptStatus: "FAILED",
      receiptError: "rpc unavailable",
      receiptAttempts: 2,
    });

    const unconfirmed = await repo.listUnconfirmedReceiptTasks();
    const found = unconfirmed.find((row) => row.id === failed.id);
    expect(found).toBeDefined();
    expect(found?.receiptStatus).toBe("FAILED");
    expect(found?.receiptError).toBe("rpc unavailable");
    expect(found?.receiptAttempts).toBe(2);
  });
});
