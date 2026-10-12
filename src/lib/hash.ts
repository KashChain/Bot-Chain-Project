import { createHash } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashResult(result: unknown): string {
  const serialized =
    typeof result === "string" ? result : JSON.stringify(result);
  return `0x${sha256Hex(serialized)}`;
}
