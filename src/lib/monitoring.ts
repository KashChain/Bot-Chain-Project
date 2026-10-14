import { randomUUID } from "crypto";
import { getServerConfig } from "./config";

export type MonitoringLevel = "debug" | "info" | "warn" | "error";

export interface MonitoringContext {
  [key: string]: unknown;
}

export interface MonitoringEvent {
  level: MonitoringLevel;
  message: string;
  timestamp: string;
  context?: MonitoringContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export type MonitoringSink = (event: MonitoringEvent) => void;

const sinks: MonitoringSink[] = [];

/**
 * Register an additional monitoring sink (e.g. a Sentry/OTel adapter). The
 * default sink writes structured JSON to stderr, which is captured by Vercel
 * log drains without requiring any external dependency.
 */
export function registerMonitoringSink(sink: MonitoringSink): void {
  sinks.push(sink);
}

const SENTRY_LEVEL: Record<MonitoringLevel, string> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

interface ParsedDsn {
  storeUrl: string;
  publicKey: string;
}

/** Parse a Sentry DSN into its store endpoint + public key. */
export function parseSentryDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      storeUrl: `${url.protocol}//${url.host}/api/${projectId}/store/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

/**
 * Sentry-compatible sink with no SDK dependency. Ships events to the Sentry
 * Store API over HTTPS; failures are swallowed so monitoring can never break a
 * request.
 */
export function createSentrySink(
  dsn: string,
  environment?: string,
): MonitoringSink {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return () => {};
  return (event: MonitoringEvent) => {
    const payload = {
      event_id: randomUUID().replace(/-/g, ""),
      timestamp: event.timestamp,
      platform: "node",
      level: SENTRY_LEVEL[event.level],
      logger: "agenthub",
      environment,
      message: { formatted: event.message },
      tags: { source: "agenthub" },
      extra: event.context,
      exception: event.error
        ? { values: [{ type: event.error.name, value: event.error.message }] }
        : undefined,
    };
    void fetch(parsed.storeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": [
          "Sentry sentry_version=7",
          `sentry_key=${parsed.publicKey}`,
          "sentry_client=agenthub/1.0",
        ].join(", "),
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };
}

let monitoringInstalled = false;

/**
 * Idempotently attach the configured external sink (e.g. Sentry). Intended to
 * be called once from `instrumentation.ts` on server startup.
 */
export function installMonitoring(): void {
  if (monitoringInstalled) return;
  monitoringInstalled = true;
  const config = getServerConfig();
  if (!config.SENTRY_DSN) return;
  const parsed = parseSentryDsn(config.SENTRY_DSN);
  if (!parsed) {
    captureMessage("SENTRY_DSN is set but could not be parsed", "warn", {
      scope: "monitoring",
    });
    return;
  }
  const environment =
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  registerMonitoringSink(createSentrySink(config.SENTRY_DSN, environment));
}

function defaultSink(event: MonitoringEvent): void {
  const line = JSON.stringify(event);
  if (event.level === "error") {
    console.error(line);
  } else if (event.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function emit(event: MonitoringEvent): void {
  defaultSink(event);
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // never let a monitoring sink break a request
    }
  }
}

export function captureMessage(
  message: string,
  level: MonitoringLevel = "info",
  context?: MonitoringContext,
): MonitoringEvent {
  const event: MonitoringEvent = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };
  emit(event);
  return event;
}

export function captureException(
  error: unknown,
  context?: MonitoringContext,
): MonitoringEvent {
  const normalized =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "UnknownError", message: String(error) };
  const event: MonitoringEvent = {
    level: "error",
    message: normalized.message,
    timestamp: new Date().toISOString(),
    context,
    error: normalized,
  };
  emit(event);
  return event;
}

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  context?: MonitoringContext,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    captureMessage(name, "debug", {
      ...context,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    captureException(error, {
      ...context,
      span: name,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export function monitoringStatus(): { enabled: boolean; sinks: number } {
  return {
    enabled: getServerConfig().hasMonitoring,
    sinks: sinks.length,
  };
}
