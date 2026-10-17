/**
 * Single source of truth for the address task payments are sent to.
 *
 * Resolution order:
 *  1. `NEXT_PUBLIC_PAYMENT_RECIPIENT` - the explicit operator-provided value.
 *  2. `PLATFORM_TREASURY_ADDRESS` - the address that already receives the
 *     platform fee, so a deployment that only configures a treasury still
 *     collects payments somewhere sensible.
 *  3. {@link DEFAULT_TESTNET_PAYMENT_RECIPIENT} - the project's own deployer /
 *     treasury address on BOT Chain Testnet. Used so a deployment that forgets
 *     to configure a recipient keeps working at checkout instead of failing
 *     with an unconfigured state.
 *
 * Values are read from the environment on every call (not cached at module
 * load) so serverless instances, the CLI and client bundles that inline
 * different values still resolve consistently within a single call.
 *
 * NOTE: on a mainnet deployment you MUST set `NEXT_PUBLIC_PAYMENT_RECIPIENT`;
 * the fallback default is a *testnet* address.
 */

export const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/** Deployer / treasury / verifier address on BOT Chain Testnet. */
export const DEFAULT_TESTNET_PAYMENT_RECIPIENT =
  "0x28B5ca1a724cA41EC3f3717F799F503A7fB10942";

export type PaymentRecipientSource = "env" | "treasury" | "default";

export function isValidAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_PATTERN.test(value.trim());
}

export interface ResolvedPaymentRecipient {
  address: string;
  source: PaymentRecipientSource;
}

/**
 * Resolve the payment recipient, always returning a usable address. Never
 * throws and never returns null, so callers (backend verification and the
 * wallet checkout component) agree on the destination even when the
 * deployment is under-configured.
 */
export function resolvePaymentRecipient(
  envValue: string | undefined = process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT,
  treasuryValue: string | undefined = process.env.PLATFORM_TREASURY_ADDRESS,
): ResolvedPaymentRecipient {
  if (isValidAddress(envValue)) {
    return { address: envValue.trim(), source: "env" };
  }
  if (isValidAddress(treasuryValue)) {
    return { address: treasuryValue.trim(), source: "treasury" };
  }
  return { address: DEFAULT_TESTNET_PAYMENT_RECIPIENT, source: "default" };
}

/** Convenience accessor for the resolved recipient address. */
export function getPaymentRecipient(): string {
  return resolvePaymentRecipient().address;
}

/** True when an explicit `NEXT_PUBLIC_PAYMENT_RECIPIENT` is set and valid. */
export function hasExplicitPaymentRecipient(): boolean {
  return resolvePaymentRecipient().source === "env";
}
