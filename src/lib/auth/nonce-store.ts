import { randomBytes } from "crypto";

interface NonceRecord {
  address: string;
  expiresAt: number;
}

const NONCE_TTL_MS = 5 * 60 * 1000;

const globalForNonce = globalThis as unknown as {
  __agenthubNonces?: Map<string, NonceRecord>;
};

function store(): Map<string, NonceRecord> {
  if (!globalForNonce.__agenthubNonces) {
    globalForNonce.__agenthubNonces = new Map();
  }
  return globalForNonce.__agenthubNonces;
}

function prune(nonces: Map<string, NonceRecord>): void {
  const now = Date.now();
  for (const [nonce, record] of nonces) {
    if (record.expiresAt < now) nonces.delete(nonce);
  }
}

export function issueNonce(address: string): string {
  const nonces = store();
  prune(nonces);
  const nonce = randomBytes(16).toString("hex");
  nonces.set(nonce, {
    address: address.toLowerCase(),
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  return nonce;
}

export function consumeNonce(nonce: string): { address: string } | null {
  const nonces = store();
  const record = nonces.get(nonce);
  if (!record) return null;
  nonces.delete(nonce);
  if (record.expiresAt < Date.now()) return null;
  return { address: record.address };
}
