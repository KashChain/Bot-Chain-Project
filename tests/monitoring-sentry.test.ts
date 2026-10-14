import { afterEach, describe, expect, it, vi } from "vitest";
import { createSentrySink, parseSentryDsn } from "@/lib/monitoring";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sentry DSN parsing", () => {
  it("builds the store endpoint from a valid DSN", () => {
    const parsed = parseSentryDsn("https://abc123@o1.ingest.sentry.io/42");
    expect(parsed).not.toBeNull();
    expect(parsed?.publicKey).toBe("abc123");
    expect(parsed?.storeUrl).toBe("https://o1.ingest.sentry.io/api/42/store/");
  });

  it("returns null for malformed DSNs", () => {
    expect(parseSentryDsn("nope")).toBeNull();
    expect(parseSentryDsn("https://example.com")).toBeNull();
  });
});

describe("Sentry sink", () => {
  it("posts a Sentry-compatible event", () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sink = createSentrySink("https://key@sentry.io/7", "test");
    sink({
      level: "error",
      message: "boom",
      timestamp: new Date().toISOString(),
      error: { name: "Error", message: "boom" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0];
    expect(url).toBe("https://sentry.io/api/7/store/");
    const body = JSON.parse(init.body as string);
    expect(body.level).toBe("error");
    expect(body.environment).toBe("test");
    expect(body.exception.values[0].value).toBe("boom");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Sentry-Auth"]).toContain("sentry_key=key");
  });

  it("is a no-op for an unparseable DSN", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    createSentrySink("bad-dsn")({
      level: "info",
      message: "x",
      timestamp: new Date().toISOString(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
