import { createHmac } from "crypto";
import { getServerConfig } from "../config";
import { getRepository, type AgentRecord, type TaskRecord } from "../repo";
import { assertSafeExternalUrl } from "../security/ssrf";

export type TaskEvent =
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_REFUNDED"
  | "TASK_DISPUTED";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

function sign(secret: string, timestamp: string, body: string): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

function buildPayload(
  task: TaskRecord,
  agent: AgentRecord,
  event: TaskEvent,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    event,
    taskId: task.id,
    agentSlug: agent.slug,
    agentId: agent.id,
    status: task.status,
    resultHash: task.resultHash,
    resultRef: task.resultRef,
    error: task.error,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

async function deliver(
  url: URL,
  body: string,
  secret: string | undefined,
  signatureHeaders: boolean,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signatureHeaders && secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers["X-AgentHub-Timestamp"] = timestamp;
    headers["X-AgentHub-Signature"] = sign(secret, timestamp, body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error(`Notification endpoint returned ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

class NotificationError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = "NotificationError";
  }
}

async function sendWithRetry(
  url: URL,
  body: string,
  secret: string | undefined,
  signatureHeaders: boolean,
): Promise<number> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await deliver(url, body, secret, signatureHeaders);
      return attempt;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
      }
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : "Notification failed";
  throw new NotificationError(message, MAX_ATTEMPTS);
}

async function dispatch(
  task: TaskRecord,
  event: TaskEvent,
  channel: "webhook" | "email",
  target: string | null | undefined,
  secret: string | undefined,
  payload: Record<string, unknown>,
  signatureHeaders: boolean,
): Promise<void> {
  const repo = getRepository();
  if (!target) {
    const record = await repo.createNotification({
      taskId: task.id,
      event,
      channel,
      target: "",
      payload,
    });
    await repo.markNotification(record.id, {
      status: "SKIPPED",
      error: "No notification target configured",
    });
    return;
  }

  const record = await repo.createNotification({
    taskId: task.id,
    event,
    channel,
    target,
    payload,
  });
  try {
    const url = await assertSafeExternalUrl(target);
    const attempts = await sendWithRetry(
      url,
      JSON.stringify(payload),
      secret,
      signatureHeaders,
    );
    await repo.markNotification(record.id, {
      status: "SENT",
      sentAt: new Date(),
      attempts,
    });
  } catch (error) {
    await repo.markNotification(record.id, {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Notification failed",
      attempts: error instanceof NotificationError ? error.attempts : 1,
    });
  }
}

/**
 * Best-effort async notifications for a task lifecycle event.
 * Never throws: delivery issues are recorded, not surfaced to callers.
 */
export async function notifyTaskEvent(
  task: TaskRecord,
  event: TaskEvent,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const repo = getRepository();
    const agent = await repo.getAgentById(task.agentId);
    if (!agent) return;
    const config = getServerConfig();
    const payload = buildPayload(task, agent, event, extra);

    await dispatch(
      task,
      event,
      "webhook",
      agent.notifyWebhookUrl,
      config.NOTIFICATION_SIGNING_SECRET,
      payload,
      true,
    );

    if (config.EMAIL_WEBHOOK_URL && task.notifyEmail) {
      await dispatch(
        task,
        event,
        "email",
        config.EMAIL_WEBHOOK_URL,
        config.NOTIFICATION_SIGNING_SECRET,
        { ...payload, to: task.notifyEmail },
        true,
      );
    }
  } catch {
    // Notifications must never break the task lifecycle.
  }
}
