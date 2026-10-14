import type { PrismaClient } from "@prisma/client";
import { isProductionRuntime } from "./config";
import { ConfigurationError } from "./errors";

const globalForPrisma = globalThis as unknown as {
  __agenthubPrisma?: PrismaClient;
};

const DIRECT_CONNECTION_LIMIT = 10;
const POOLED_CONNECTION_LIMIT = 1;
const DEFAULT_POOL_TIMEOUT_SECONDS = 20;

export type DatabasePoolProvider = "neon" | "supabase" | "pgbouncer" | "direct";

export interface DatabasePoolSettings {
  /** Connection URL with pool parameters applied. */
  url: string;
  provider: DatabasePoolProvider;
  /** True when the URL points at a transaction-mode pooler (PgBouncer). */
  pooled: boolean;
  connectionLimit: number;
  poolTimeoutSeconds: number;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function detectProvider(url: URL): DatabasePoolProvider {
  const host = url.hostname.toLowerCase();
  const isNeon = host.endsWith(".neon.tech");
  if (isNeon && host.includes("-pooler")) return "neon";
  if (host.endsWith(".pooler.supabase.com") || url.port === "6543") {
    return "supabase";
  }
  if (url.searchParams.get("pgbouncer") === "true") return "pgbouncer";
  return "direct";
}

/**
 * Resolve the effective Postgres connection URL with pooling parameters.
 *
 * Prisma needs different settings depending on how the database is fronted:
 *  - Neon / Supabase / PgBouncer run PgBouncer in transaction mode, which does
 *    not support prepared statements. Prisma requires `pgbouncer=true` and a
 *    small `connection_limit` (default 1) so a serverless instance does not
 *    exhaust the pooler's connection slots.
 *  - Direct connections use a larger per-instance pool.
 *
 * Existing query parameters win, so operators can override anything in
 * `DATABASE_URL`. `PRISMA_CONNECTION_LIMIT` / `PRISMA_POOL_TIMEOUT` act as
 * defaults when the URL does not specify them.
 */
export function resolveDatabasePoolSettings(rawUrl: string): DatabasePoolSettings {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigurationError("DATABASE_URL is not a valid connection URL");
  }

  const provider = detectProvider(url);
  const pooled = provider !== "direct";

  const defaultConnectionLimit = pooled
    ? POOLED_CONNECTION_LIMIT
    : DIRECT_CONNECTION_LIMIT;
  const connectionLimit =
    readPositiveInt("PRISMA_CONNECTION_LIMIT", defaultConnectionLimit) ||
    defaultConnectionLimit;
  const poolTimeoutSeconds = readPositiveInt(
    "PRISMA_POOL_TIMEOUT",
    DEFAULT_POOL_TIMEOUT_SECONDS,
  );

  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(connectionLimit));
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", String(poolTimeoutSeconds));
  }
  if (pooled && !url.searchParams.has("pgbouncer")) {
    url.searchParams.set("pgbouncer", "true");
  }

  const effectiveLimit =
    Number.parseInt(url.searchParams.get("connection_limit") ?? "", 10) ||
    connectionLimit;
  const effectivePoolTimeout =
    Number.parseInt(url.searchParams.get("pool_timeout") ?? "", 10) ||
    poolTimeoutSeconds;

  return {
    url: url.toString(),
    provider,
    pooled,
    connectionLimit: effectiveLimit,
    poolTimeoutSeconds: effectivePoolTimeout,
  };
}

export function getDatabasePoolSettings(): DatabasePoolSettings {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new ConfigurationError(
      "DATABASE_URL is not configured; the Prisma repository is unavailable",
    );
  }
  return resolveDatabasePoolSettings(raw);
}

export async function getPrismaClient(): Promise<PrismaClient> {
  if (!globalForPrisma.__agenthubPrisma) {
    const settings = getDatabasePoolSettings();
    const { PrismaClient: Client } = await import("@prisma/client");
    globalForPrisma.__agenthubPrisma = new Client({
      datasourceUrl: settings.url,
      log: isProductionRuntime() ? ["error"] : ["error", "warn"],
    });
  }
  return globalForPrisma.__agenthubPrisma;
}

/**
 * Release pooled connections. Safe to call during graceful shutdown or between
 * tests; the next `getPrismaClient()` call lazily recreates the client.
 */
export async function disconnectPrismaClient(): Promise<void> {
  if (globalForPrisma.__agenthubPrisma) {
    await globalForPrisma.__agenthubPrisma.$disconnect();
    globalForPrisma.__agenthubPrisma = undefined;
  }
}
