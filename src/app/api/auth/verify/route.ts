import { NextRequest } from "next/server";
import { getAddress } from "ethers";
import { jsonOk, handle, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerConfig } from "@/lib/config";
import { AppError, ConfigurationError } from "@/lib/errors";
import { consumeNonce } from "@/lib/auth/nonce-store";
import { parseSiweMessage, recoverSiweAddress } from "@/lib/auth/siwe";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { siweVerifySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);

function hostMatches(host: string, domain: string): boolean {
  const hostname = host.split(":")[0].toLowerCase();
  const domainName = domain.split(":")[0].toLowerCase();
  if (hostname === domainName) return true;
  return ALLOWED_HOSTS.has(hostname) || ALLOWED_HOSTS.has(domainName);
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    checkRateLimit(rateLimitKey("auth:verify", getClientIp(request)));
    if (!getServerConfig().hasSession) {
      throw new ConfigurationError(
        "SESSION_SECRET is not configured; wallet sign-in is disabled",
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = siweVerifySchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk(
        { error: "Validation failed", code: "VALIDATION_ERROR" },
        422,
      );
    }

    const fields = parseSiweMessage(parsed.data.message);
    if (!fields) {
      return jsonOk({ error: "Malformed SIWE message", code: "INVALID_MESSAGE" }, 400);
    }

    const recovered = await recoverSiweAddress(
      parsed.data.message,
      parsed.data.signature,
    );
    if (!recovered || recovered.toLowerCase() !== fields.address.toLowerCase()) {
      return jsonOk({ error: "Signature does not match address", code: "INVALID_SIGNATURE" }, 401);
    }

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    if (host && !hostMatches(host, fields.domain)) {
      return jsonOk({ error: "SIWE domain mismatch", code: "DOMAIN_MISMATCH" }, 400);
    }

    const config = getServerConfig();
    if (fields.chainId !== config.BOTCHAIN_TESTNET_CHAIN_ID) {
      return jsonOk(
        {
          error: `Unsupported chain id ${fields.chainId}`,
          code: "CHAIN_MISMATCH",
        },
        400,
      );
    }

    const issuedAt = Date.parse(fields.issuedAt);
    if (Number.isFinite(issuedAt) && issuedAt > Date.now() + 5 * 60 * 1000) {
      return jsonOk({ error: "Message issued in the future", code: "INVALID_MESSAGE" }, 400);
    }
    if (fields.expirationTime) {
      const expires = Date.parse(fields.expirationTime);
      if (Number.isFinite(expires) && expires < Date.now()) {
        return jsonOk({ error: "Message has expired", code: "EXPIRED" }, 400);
      }
    }

    const consumed = consumeNonce(fields.nonce);
    if (!consumed) {
      return jsonOk({ error: "Unknown or expired nonce", code: "INVALID_NONCE" }, 401);
    }
    if (consumed.address !== fields.address.toLowerCase()) {
      throw new AppError("Nonce does not belong to this address", 401, "INVALID_NONCE");
    }

    let address: string;
    try {
      address = getAddress(fields.address);
    } catch {
      return jsonOk({ error: "Invalid address", code: "INVALID_MESSAGE" }, 400);
    }

    const token = createSessionToken(address);
    const response = jsonOk({ address });
    setSessionCookie(response, token);
    return response;
  });
}
