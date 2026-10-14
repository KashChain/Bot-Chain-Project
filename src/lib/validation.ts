import { z } from "zod";

export const AGENT_CATEGORIES = [
  "Research",
  "Blockchain Analytics",
  "Data",
  "Code",
  "Writing",
  "Productivity",
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid EVM address");

export const txHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid 32-byte transaction hash");

export const agentIdParamsSchema = z.object({
  id: z.string().min(1).max(100),
});

export const createAgentSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes"),
  description: z.string().min(20).max(2000),
  category: z.enum(AGENT_CATEGORIES),
  capabilities: z.array(z.string().min(1).max(80)).min(1).max(12),
  usageInstructions: z.string().min(10).max(2000),
  endpoint: z
    .string()
    .url()
    .max(300)
    .refine(
      (value) => value.startsWith("https://") || value.startsWith("http://localhost"),
      "Endpoint must use https:// (http://localhost is allowed for development)",
    ),
  priceWei: z
    .string()
    .regex(/^\d+$/, "Must be an integer string of wei")
    .transform((value) => value),
  ownerAddress: addressSchema,
  metadataUri: z.string().max(300).optional(),
  webhookSecret: z.string().min(16).max(200).optional(),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const agentListQuerySchema = z.object({
  search: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  capabilities: z.string().max(600).optional(),
  sort: z
    .enum(["name", "price-asc", "price-desc", "newest", "rating", "popularity"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export type AgentListQuery = z.infer<typeof agentListQuerySchema>;

export const createReviewSchema = z.object({
  taskId: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  reviewerAddress: addressSchema.optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const siweNonceQuerySchema = z.object({
  address: addressSchema,
});

export const siweVerifySchema = z.object({
  message: z.string().min(20).max(4000),
  signature: z
    .string()
    .regex(/^0x[a-fA-F0-9]{130}$/, "Must be a valid 65-byte signature"),
});

export type SiweVerifyInput = z.infer<typeof siweVerifySchema>;

export const createTaskSchema = z.object({
  agentSlug: z.string().min(1).max(80),
  input: z.string().min(5),
  clientAddress: addressSchema,
  notifyEmail: z.string().email().max(200).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const createDisputeSchema = z.object({
  reason: z.string().min(5).max(1000),
  openedBy: addressSchema.optional(),
});

export const reportAgentSchema = z.object({
  reason: z.string().min(3).max(200),
  details: z.string().max(2000).optional(),
  reporterAddress: addressSchema.optional(),
});

export const stakeSchema = z.object({
  amountWei: z.string().regex(/^\d+$/),
  txHash: txHashSchema.optional(),
  ownerAddress: addressSchema.optional(),
});

export const moderationActionSchema = z.object({
  action: z.enum(["dismiss", "suspend", "ban"]),
});

export const resolutionSchema = z.object({
  action: z.enum(["refund", "release"]),
});

export const creatorQuerySchema = z.object({
  ownerAddress: addressSchema.optional(),
});

export const verifyPaymentSchema = z.object({
  txHash: txHashSchema.optional(),
});

export const executeTaskSchema = z.object({
  txHash: txHashSchema.optional(),
});

export function boundedInputSchema(maxChars: number) {
  return z.string().min(5).max(maxChars);
}

export const API_KEY_SCOPES = ["agents:read", "tasks:read", "tasks:write"] as const;

export const createApiKeySchema = z.object({
  name: z.string().min(2).max(80),
  ownerAddress: addressSchema.optional(),
  rateLimit: z.coerce.number().int().min(1).max(10_000).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).max(8).optional(),
});

export const apiKeyQuerySchema = z.object({
  ownerAddress: addressSchema.optional(),
});

export const creditTopupSchema = z.object({
  ownerAddress: addressSchema.optional(),
  amountWei: z.string().regex(/^\d+$/, "Must be an integer string of wei"),
  reference: z.string().min(1).max(200).optional(),
});

export const creditQuerySchema = z.object({
  ownerAddress: addressSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const subscriptionQuerySchema = z.object({
  ownerAddress: addressSchema.optional(),
});

export const createSubscriptionSchema = z.object({
  planId: z.string().min(1).max(60),
  agentId: z.string().min(1).max(100).optional(),
  ownerAddress: addressSchema.optional(),
});

export const v1TaskListQuerySchema = z.object({
  status: z
    .enum([
      "CREATED",
      "PAYMENT_PENDING",
      "PAID",
      "PROCESSING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "DISPUTED",
      "REFUND_REQUESTED",
      "REFUNDED",
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const v1TaskCreateSchema = z.object({
  agentSlug: z.string().min(1).max(80),
  input: z.string().min(5).max(8000),
  clientAddress: addressSchema.optional(),
  notifyEmail: z.string().email().max(200).optional(),
});

export const analyticsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
});
