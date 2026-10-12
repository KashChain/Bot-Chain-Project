import type { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __agenthubPrisma?: PrismaClient;
};

export async function getPrismaClient(): Promise<PrismaClient> {
  if (!globalForPrisma.__agenthubPrisma) {
    const { PrismaClient: Client } = await import("@prisma/client");
    globalForPrisma.__agenthubPrisma = new Client();
  }
  return globalForPrisma.__agenthubPrisma;
}
