import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const SECRET_ENV = [
  "LLM_API_KEY",
  "DEPLOYER_PRIVATE_KEY",
  "DATABASE_URL",
  "ADMIN_API_TOKEN",
];

describe("secret exposure guardrails", () => {
  const files = walk(SRC);

  it("never exposes server secrets through NEXT_PUBLIC_ variables", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const secret of SECRET_ENV) {
        if (content.includes(`NEXT_PUBLIC_${secret}`)) {
          offenders.push(`${file}: NEXT_PUBLIC_${secret}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps secrets out of client components", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (content.trimStart().startsWith('"use client"') || content.includes('\n"use client"')) {
        for (const secret of SECRET_ENV) {
          if (content.includes(secret)) offenders.push(`${file}: ${secret}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
