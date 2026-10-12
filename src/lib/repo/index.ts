import { getServerConfig } from "../config";
import { getMemoryRepository } from "./memory";
import { getPrismaRepository } from "./prisma";
import type { Repository } from "./types";

export function getRepository(): Repository {
  const config = getServerConfig();
  return config.hasDatabase ? getPrismaRepository() : getMemoryRepository();
}

export function getRepositoryKind(): "prisma" | "memory" {
  return getServerConfig().hasDatabase ? "prisma" : "memory";
}

export * from "./types";
