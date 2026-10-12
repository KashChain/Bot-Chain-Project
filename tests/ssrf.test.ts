import { describe, expect, it } from "vitest";
import { assertSafeExternalUrl } from "@/lib/security/ssrf";

describe("SSRF protection", () => {
  it("blocks localhost and loopback", async () => {
    await expect(assertSafeExternalUrl("http://localhost/agent")).rejects.toThrow();
    await expect(assertSafeExternalUrl("http://127.0.0.1/agent")).rejects.toThrow();
    await expect(assertSafeExternalUrl("http://[::1]/agent")).rejects.toThrow();
  });

  it("blocks cloud metadata and private ranges", async () => {
    await expect(
      assertSafeExternalUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toThrow();
    await expect(assertSafeExternalUrl("http://10.0.0.5/agent")).rejects.toThrow();
    await expect(
      assertSafeExternalUrl("http://192.168.1.10/agent"),
    ).rejects.toThrow();
    await expect(
      assertSafeExternalUrl("http://172.16.5.5/agent"),
    ).rejects.toThrow();
  });

  it("blocks non-http protocols", async () => {
    await expect(assertSafeExternalUrl("ftp://example.com")).rejects.toThrow();
    await expect(
      assertSafeExternalUrl("file:///etc/passwd"),
    ).rejects.toThrow();
  });
});
