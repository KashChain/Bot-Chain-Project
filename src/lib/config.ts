import { z } from "zod";
import {
  hasExplicitPaymentRecipient,
  resolvePaymentRecipient,
} from "./payments/recipient";

/**
 * Treat blank env values (e.g. `FOO=` in a `.env` file) as "not provided" so
 * optional numeric fields fall back to their defaults instead of coercing an
 * empty string to 0 and failing validation.
 */
function emptyToUndefined(value: unknown): unknown {
  if (value === "" || value === undefined || value === null) return undefined;
  return value;
}

const optionalPositiveInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().optional(),
);

function intWithDefault(fallback: number) {
  return z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(fallback),
  );
}

const serverSchema = z.object({
  DATABASE_URL: z.string().optional(),
  BOTCHAIN_TESTNET_RPC_URL: z.string().url().default("https://rpc.bohr.life"),
  BOTCHAIN_TESTNET_CHAIN_ID: z.coerce.number().int().positive().default(968),
  BOTCHAIN_EXPLORER_URL: z.string().url().default("https://scan.bohr.life"),
  PAYMENT_MODE: z.enum(["mock", "onchain"]).default("onchain"),
  ENABLE_MOCK_PAYMENT: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ENABLE_DEMO_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  BLOCKCHAIN_DATA_API_KEY: z.string().optional(),
  BLOCKCHAIN_DATA_API_URL: z.string().url().optional(),
  AGENT_MARKETPLACE_CONTRACT_ADDRESS: z.string().optional(),
  ADMIN_API_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(250),
  PLATFORM_TREASURY_ADDRESS: z.string().optional(),
  ESCROW_MODE: z.enum(["mock", "contract"]).default("mock"),
  ESCROW_CONTRACT_ADDRESS: z.string().optional(),
  MIN_STAKE_WEI: z
    .string()
    .regex(/^\d+$/)
    .default("1000000000000000000"),
  NOTIFICATION_SIGNING_SECRET: z.string().optional(),
  EMAIL_WEBHOOK_URL: z.string().url().optional(),
  MAX_PROMPT_CHARS: z.coerce.number().int().positive().default(4000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  API_KEY_RATE_LIMIT_DEFAULT: z.coerce.number().int().positive().default(60),
  API_KEY_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  CRON_SECRET: z.string().optional(),
  RECEIPT_SYNC_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(25),
  STALE_TASK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  ENABLE_CREDITS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  TOKEN_USDT_ADDRESS: z.string().optional(),
  TOKEN_USDC_ADDRESS: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  // Connection-pool tuning. Defaults are chosen per provider in `prisma.ts`.
  PRISMA_CONNECTION_LIMIT: optionalPositiveInt,
  PRISMA_POOL_TIMEOUT: optionalPositiveInt,
  // External (developer webhook) agent execution hardening.
  EXTERNAL_AGENT_TIMEOUT_MS: intWithDefault(30_000),
  EXTERNAL_AGENT_MAX_ATTEMPTS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(10).default(3),
  ),
  EXTERNAL_AGENT_BACKOFF_MS: intWithDefault(250),
});

const publicSchema = z.object({
  NEXT_PUBLIC_BOTCHAIN_TESTNET_CHAIN_ID: z.coerce
    .number()
    .int()
    .positive()
    .default(968),
  NEXT_PUBLIC_BOTCHAIN_EXPLORER_URL: z
    .string()
    .url()
    .default("https://scan.bohr.life"),
  NEXT_PUBLIC_BOTCHAIN_RPC_URL: z
    .string()
    .url()
    .default("https://rpc.bohr.life"),
  NEXT_PUBLIC_BOTCHAIN_NAME: z.string().default("BOT Chain Testnet"),
  NEXT_PUBLIC_BOTCHAIN_CURRENCY_SYMBOL: z.string().default("BOT"),
  NEXT_PUBLIC_PAYMENT_RECIPIENT: z.string().optional(),
});

export type ServerConfig = z.infer<typeof serverSchema> & {
  hasDatabase: boolean;
  hasLlm: boolean;
  hasSession: boolean;
  hasCron: boolean;
  hasMonitoring: boolean;
};
export type PublicConfig = z.infer<typeof publicSchema>;

function parseServerConfig(): ServerConfig {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment configuration: ${issues}`);
  }
  const data = parsed.data;
  let hasDatabase = false;
  if (data.DATABASE_URL) {
    try {
      const url = new URL(data.DATABASE_URL);
      hasDatabase = url.protocol.startsWith("postgres");
    } catch {
      hasDatabase = false;
    }
  }
  return {
    ...data,
    hasDatabase,
    hasLlm: Boolean(data.LLM_API_KEY),
    hasSession: Boolean(data.SESSION_SECRET),
    hasCron: Boolean(data.CRON_SECRET),
    hasMonitoring: Boolean(data.SENTRY_DSN),
  };
}

let cachedServerConfig: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (!cachedServerConfig) {
    cachedServerConfig = parseServerConfig();
  }
  return cachedServerConfig;
}

/**
 * True when running a production build/runtime. This is evaluated dynamically
 * (not cached) so tests can toggle `NODE_ENV`.
 */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export const publicConfig: PublicConfig = (() => {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_BOTCHAIN_TESTNET_CHAIN_ID:
      process.env.NEXT_PUBLIC_BOTCHAIN_TESTNET_CHAIN_ID,
    NEXT_PUBLIC_BOTCHAIN_EXPLORER_URL:
      process.env.NEXT_PUBLIC_BOTCHAIN_EXPLORER_URL,
    NEXT_PUBLIC_BOTCHAIN_RPC_URL: process.env.NEXT_PUBLIC_BOTCHAIN_RPC_URL,
    NEXT_PUBLIC_BOTCHAIN_NAME: process.env.NEXT_PUBLIC_BOTCHAIN_NAME,
    NEXT_PUBLIC_BOTCHAIN_CURRENCY_SYMBOL:
      process.env.NEXT_PUBLIC_BOTCHAIN_CURRENCY_SYMBOL,
    NEXT_PUBLIC_PAYMENT_RECIPIENT:
      process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
})();

export function isPaymentRecipientConfigured(): boolean {
  return hasExplicitPaymentRecipient();
}

let paymentRecipientWarned = false;

/**
 * Log a clear warning at server startup when `NEXT_PUBLIC_PAYMENT_RECIPIENT`
 * is unset or invalid. Payments keep working via `resolvePaymentRecipient()`,
 * but operators need to know which address will actually receive funds.
 *
 * Called once from `src/instrumentation.ts`. Uses `console.warn` rather than
 * the monitoring sinks to avoid a circular import (monitoring imports config).
 */
export function logPaymentRecipientConfigWarning(): void {
  if (paymentRecipientWarned) return;
  paymentRecipientWarned = true;

  const { address, source } = resolvePaymentRecipient();
  if (source === "env") return;

  const reason =
    source === "treasury"
      ? "NEXT_PUBLIC_PAYMENT_RECIPIENT is unset; falling back to PLATFORM_TREASURY_ADDRESS"
      : "NEXT_PUBLIC_PAYMENT_RECIPIENT is unset or not a valid address; falling back to the default testnet recipient";
  console.warn(
    `[agenthub] ${reason}. Task payments will be verified against ${address}. Set NEXT_PUBLIC_PAYMENT_RECIPIENT to change this.`,
  );
}
