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
