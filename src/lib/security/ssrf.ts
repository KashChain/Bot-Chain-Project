import { isIP } from "net";
import { lookup } from "dns/promises";
import { AppError } from "../errors";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.replace("::ffff:", "");
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError("Agent endpoint is not a valid URL", 400, "BAD_ENDPOINT");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError(
      "Agent endpoint must use http(s)",
      400,
      "BAD_ENDPOINT_PROTOCOL",
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new AppError(
      "Agent endpoint must not point to local or internal hosts",
      400,
      "SSRF_BLOCKED",
    );
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new AppError(
        "Agent endpoint must not point to a private or reserved IP",
        400,
        "SSRF_BLOCKED",
      );
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new AppError(
      "Agent endpoint hostname could not be resolved",
      400,
      "ENDPOINT_DNS_ERROR",
    );
  }

  if (addresses.length === 0) {
    throw new AppError(
      "Agent endpoint hostname did not resolve to any address",
      400,
      "ENDPOINT_DNS_ERROR",
    );
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new AppError(
        "Agent endpoint resolves to a private or reserved IP address",
        400,
        "SSRF_BLOCKED",
      );
    }
  }

  return url;
}
