import { AppError, ConfigurationError } from "../errors";

const PRIVATE_KEY_RE = /^(?:0x)?[0-9a-fA-F]{64}$/;
const BYTES32_BODY_RE = /^[0-9a-fA-F]{64}$/;
const BYTES32_PREFIX_RE = /^(?:(?:0x=)|(?:0x))+/i;

/**
 * Normalize an operator private key supplied through the environment.
 *
 * Accepts `key`, `0xkey` and surrounding whitespace. Rejects values that look
 * like an assignment (`DEPLOYER_PRIVATE_KEY=0x...` or a bare `=0x...`), which
 * is how a malformed secret silently reached production once before. Error
 * messages never include the secret itself.
 */
export function normalizePrivateKey(raw: string | undefined | null): string {
  if (raw == null) {
    throw new ConfigurationError("DEPLOYER_PRIVATE_KEY is not configured");
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ConfigurationError("DEPLOYER_PRIVATE_KEY is empty");
  }
  if (trimmed.includes("=") || /\s/.test(trimmed)) {
    throw new ConfigurationError(
      "DEPLOYER_PRIVATE_KEY is malformed: it must contain only the 64-character hex key (optionally 0x-prefixed), not `NAME=VALUE` text or whitespace.",
    );
  }
  if (!PRIVATE_KEY_RE.test(trimmed)) {
    throw new ConfigurationError(
      "DEPLOYER_PRIVATE_KEY is malformed: expected exactly 64 hex characters (optionally 0x-prefixed).",
    );
  }
  return `0x${trimmed.replace(/^0x/i, "").toLowerCase()}`;
}

/**
 * Redact long hex runs (private keys, secrets embedded in provider/ethers
 * errors) before persisting or returning an error message.
 */
export function redactSecrets(message: string): string {
  return message.replace(/[0-9a-fA-F]{64,}/g, "[redacted]");
}

/**
 * Normalize common accidental prefixes while preserving strict bytes32
 * validation. For example, `0x=0x<hash>` and `0x0x<hash>` become `0x<hash>`.
 */
export function normalizeBytes32(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const prefix = trimmed.match(BYTES32_PREFIX_RE)?.[0];
  if (!prefix) return null;
  const body = trimmed.slice(prefix.length);
  if (!BYTES32_BODY_RE.test(body)) return null;
  return `0x${body.toLowerCase()}`;
}

/** True when a value can be normalized to a 0x-prefixed 32-byte hex string. */
export function isValidBytes32(value: unknown): value is string {
  return normalizeBytes32(value) !== null;
}

/**
 * Validate and normalize a `bytes32` value before it is handed to ethers.
 * Throws a descriptive error instead of ethers' low-level `invalid BytesLike
 * value` message, which leaks the raw input (and once leaked a private key).
 */
export function assertBytes32(value: unknown, field: string): string {
  const normalized = normalizeBytes32(value);
  if (!normalized) {
    throw new AppError(
      `Invalid ${field}: expected a 0x-prefixed 32-byte hex value (66 characters).`,
      500,
      "INVALID_BYTES32",
    );
  }
  return normalized;
}
