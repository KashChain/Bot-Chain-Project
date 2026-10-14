import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDatabasePoolSettings } from "@/lib/prisma";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("database pool resolution", () => {
  it("uses a single pooled connection for Neon pooler hosts", () => {
    const settings = resolveDatabasePoolSettings(
      "postgresql://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/db",
    );
    expect(settings.provider).toBe("neon");
    expect(settings.pooled).toBe(true);
    const url = new URL(settings.url);
    expect(url.searchParams.get("connection_limit")).toBe("1");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
  });

  it("detects the Supabase transaction pooler (port 6543)", () => {
    const settings = resolveDatabasePoolSettings(
      "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(settings.provider).toBe("supabase");
    expect(settings.pooled).toBe(true);
    expect(settings.connectionLimit).toBe(1);
  });

  it("uses a larger direct pool for plain connections", () => {
    const settings = resolveDatabasePoolSettings(
      "postgresql://agenthub_dev@127.0.0.1:55432/agenthub_test",
    );
    expect(settings.provider).toBe("direct");
    expect(settings.pooled).toBe(false);
    expect(settings.connectionLimit).toBe(10);
    expect(new URL(settings.url).searchParams.get("pgbouncer")).toBeNull();
  });

  it("honours explicit URL parameters over defaults", () => {
    const settings = resolveDatabasePoolSettings(
      "postgresql://u:p@db.neon.tech/app?connection_limit=5&pool_timeout=7",
    );
    expect(settings.connectionLimit).toBe(5);
    expect(settings.poolTimeoutSeconds).toBe(7);
  });

  it("rejects invalid connection URLs", () => {
    expect(() => resolveDatabasePoolSettings("not-a-url")).toThrow(
      /valid connection URL/,
    );
  });
});
