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
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const createTaskSchema = z.object({
  agentSlug: z.string().min(1).max(80),
  input: z.string().min(5),
  clientAddress: addressSchema,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const verifyPaymentSchema = z.object({
  txHash: txHashSchema,
});

export const executeTaskSchema = z.object({
  txHash: txHashSchema.optional(),
});

export function boundedInputSchema(maxChars: number) {
  return z.string().min(5).max(maxChars);
}
