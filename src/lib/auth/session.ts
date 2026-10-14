import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "../config";
import { ConfigurationError } from "../errors";

export const SESSION_COOKIE = "agenthub_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  address: string;
  exp: number;
}

function getSecret(): string {
  const secret = getServerConfig().SESSION_SECRET;
  if (!secret) {
    throw new ConfigurationError(
      "SESSION_SECRET is not configured; wallet sign-in is disabled",
    );
  }
  return secret;
}

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(body: string): string {
  return base64url(createHmac("sha256", getSecret()).update(body).digest());
}

export function createSessionToken(address: string, ttlMs = SESSION_TTL_MS): string {
  const payload: SessionPayload = {
    address: address.toLowerCase(),
    exp: Date.now() + ttlMs,
  };
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(provided, expectedBuf)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as SessionPayload;
    if (typeof payload.address !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSession(request: NextRequest): SessionPayload | null {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
