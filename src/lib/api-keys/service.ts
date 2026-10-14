import { randomBytes } from "crypto";
import { getServerConfig } from "../config";
import { sha256Hex } from "../hash";
import { getRepository } from "../repo";
import type { ApiKeyRecord } from "../repo/types";

export const API_KEY_PREFIX = "ab_";
export const API_KEY_BYTES = 32;

export interface GeneratedApiKey {
  token: string;
  keyHash: string;
  keyPrefix: string;
}

export function hashApiKey(token: string): string {
  return sha256Hex(token.trim());
}

export function generateApiKey(): GeneratedApiKey {
  const raw = randomBytes(API_KEY_BYTES).toString("base64url");
  const token = `${API_KEY_PREFIX}${raw}`;
  return {
    token,
    keyHash: hashApiKey(token),
    keyPrefix: `${token.slice(0, 11)}...`,
  };
}

export function isValidApiKeyFormat(token: string | undefined | null): boolean {
  if (!token) return false;
  return new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{16,}$`).test(token.trim());
}

export interface PublicApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  ownerAddress: string;
  rateLimit: number;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function toPublicApiKey(record: ApiKeyRecord): PublicApiKey {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    ownerAddress: record.ownerAddress,
    rateLimit: record.rateLimit,
    scopes: record.scopes,
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
  };
}

export interface CreatedApiKey extends PublicApiKey {
  token: string;
}

export async function createApiKey(input: {
  name: string;
  ownerAddress: string;
  rateLimit?: number;
  scopes?: string[];
}): Promise<CreatedApiKey> {
  const config = getServerConfig();
  const generated = generateApiKey();
  const record = await getRepository().createApiKey({
    name: input.name,
    keyHash: generated.keyHash,
    keyPrefix: generated.keyPrefix,
    ownerAddress: input.ownerAddress,
    rateLimit: input.rateLimit ?? config.API_KEY_RATE_LIMIT_DEFAULT,
    scopes: input.scopes ?? [],
  });
  return { ...toPublicApiKey(record), token: generated.token };
}

export interface VerifiedApiKey {
  record: ApiKeyRecord;
  ownerAddress: string;
}

export async function verifyApiKey(
  token: string | undefined | null,
): Promise<VerifiedApiKey | null> {
  if (!isValidApiKeyFormat(token)) return null;
  const repository = getRepository();
  const record = await repository.getApiKeyByHash(hashApiKey(token as string));
  if (!record || record.revokedAt) return null;
  const now = new Date();
  if (!record.lastUsedAt || now.getTime() - record.lastUsedAt.getTime() > 60_000) {
    await repository.updateApiKey(record.id, { lastUsedAt: now });
  }
  return { record, ownerAddress: record.ownerAddress };
}

export async function revokeApiKey(
  id: string,
  ownerAddress?: string,
): Promise<ApiKeyRecord> {
  const repository = getRepository();
  const record = await repository.getApiKeyById(id);
  if (!record) {
    const { NotFoundError } = await import("../errors");
    throw new NotFoundError("API key not found");
  }
  if (
    ownerAddress &&
    record.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()
  ) {
    const { ForbiddenError } = await import("../errors");
    throw new ForbiddenError("You can only revoke your own API keys");
  }
  if (record.revokedAt) return record;
  return repository.updateApiKey(id, { revokedAt: new Date() });
}
