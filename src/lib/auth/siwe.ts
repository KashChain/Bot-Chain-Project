import { getAddress, verifyMessage } from "ethers";

export interface SiweFields {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

export interface BuildSiweOptions {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  statement?: string;
  issuedAt?: string;
  expirationTime?: string;
}

export function buildSiweMessage(options: BuildSiweOptions): string {
  const address = getAddress(options.address);
  const issuedAt = options.issuedAt ?? new Date().toISOString();
  const lines = [
    `${options.domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
  ];
  if (options.statement) {
    lines.push(options.statement, "");
  }
  lines.push(
    `URI: ${options.uri}`,
    `Version: 1`,
    `Chain ID: ${options.chainId}`,
    `Nonce: ${options.nonce}`,
    `Issued At: ${issuedAt}`,
  );
  if (options.expirationTime) {
    lines.push(`Expiration Time: ${options.expirationTime}`);
  }
  return lines.join("\n");
}

export function parseSiweMessage(message: string): SiweFields | null {
  const lines = message.split("\n");
  if (lines.length < 3) return null;

  const header = lines[0];
  const suffix = " wants you to sign in with your Ethereum account:";
  if (!header.endsWith(suffix)) return null;
  const domain = header.slice(0, header.length - suffix.length);

  const address = lines[1]?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  const rest = lines.slice(2);
  const fields: Record<string, string> = {};
  const statementLines: string[] = [];
  let inHeaderBlock = true;

  for (const line of rest) {
    const match = /^([A-Za-z][A-Za-z ]*):\s?(.*)$/.exec(line);
    if (match && ["URI", "Version", "Chain ID", "Nonce", "Issued At", "Expiration Time", "Request ID", "Not Before"].includes(match[1])) {
      inHeaderBlock = false;
      fields[match[1]] = match[2];
      continue;
    }
    if (inHeaderBlock) {
      statementLines.push(line);
    }
  }

  const statement = statementLines.join("\n").trim();
  const chainId = Number.parseInt(fields["Chain ID"] ?? "", 10);

  if (!fields.URI || !fields.Nonce || !fields["Issued At"] || !Number.isFinite(chainId)) {
    return null;
  }

  return {
    domain,
    address,
    statement: statement.length > 0 ? statement : undefined,
    uri: fields.URI,
    version: fields.Version ?? "1",
    chainId,
    nonce: fields.Nonce,
    issuedAt: fields["Issued At"],
    expirationTime: fields["Expiration Time"],
  };
}

export async function recoverSiweAddress(
  message: string,
  signature: string,
): Promise<string | null> {
  try {
    const recovered = verifyMessage(message, signature);
    return getAddress(recovered);
  } catch {
    return null;
  }
}
