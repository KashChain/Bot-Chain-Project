import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(() => ({ ADMIN_API_TOKEN: undefined })),
}));

import { getServerConfig } from "@/lib/config";
import { assertAdmin, isAdminApiConfigured } from "@/lib/admin";

const cfg = vi.mocked(getServerConfig);
const TOKEN = "super-secret-admin-token";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/admin", { headers });
}

beforeEach(() => {
  cfg.mockReset();
});

describe("assertAdmin", () => {
  it("hides the endpoint (404) when no token is configured", () => {
    cfg.mockReturnValue({ ADMIN_API_TOKEN: undefined } as never);
    expect(isAdminApiConfigured()).toBe(false);
    expect(() => assertAdmin(request())).toThrow(/Admin endpoints are disabled/);
  });

  it("rejects a missing or wrong token", () => {
    cfg.mockReturnValue({ ADMIN_API_TOKEN: TOKEN } as never);
    expect(isAdminApiConfigured()).toBe(true);
    expect(() => assertAdmin(request())).toThrow(/Unauthorized/);
    expect(() => assertAdmin(request({ "x-admin-token": "wrong" }))).toThrow(
      /Unauthorized/,
    );
  });

  it("accepts the correct token", () => {
    cfg.mockReturnValue({ ADMIN_API_TOKEN: TOKEN } as never);
    expect(() => assertAdmin(request({ "x-admin-token": TOKEN }))).not.toThrow();
  });
});
