import { z } from "zod";

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
  const recipient = publicConfig.NEXT_PUBLIC_PAYMENT_RECIPIENT;
  return typeof recipient === "string" && /^0x[a-fA-F0-9]{40}$/.test(recipient);
}
