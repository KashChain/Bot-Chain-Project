import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getServerConfig: vi.fn(() => ({
    PLATFORM_FEE_BPS: 250,
    ESCROW_MODE: "mock",
    MIN_STAKE_WEI: "1000000000000000000",
    NOTIFICATION_SIGNING_SECRET: "test-secret-value",
    EMAIL_WEBHOOK_URL: undefined,
  })),
}));

import { notifyTaskEvent } from "@/lib/notifications/service";
import { getRepository } from "@/lib/repo";

const OWNER = "0x1111111111111111111111111111111111111111";
const CLIENT = "0x2222222222222222222222222222222222222222";
const WEBHOOK = "https://93.184.216.34/hook";

async function makeTask(notifyWebhookUrl: string | null) {
  const repo = getRepository();
  const agent = await repo.createAgent({
    slug: `notify-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: "Notify agent",
    description: "An agent used to exercise the notification pipeline tests.",
    category: "Research",
    capabilities: ["Notify"],
    usageInstructions: "Describe the task for the notification test here.",
    endpoint: "https://example.com/notify",
    priceWei: "1000000000000000000",
    ownerAddress: OWNER,
  });
  await repo.updateAgent(agent.id, { notifyWebhookUrl });
  const task = await repo.createTask({
    agentId: agent.id,
    clientAddress: CLIENT,
    input: "notify input",
    inputHash: "0xabc",
    priceWei: "1000000000000000000",
    status: "COMPLETED",
  });
  return task;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("task notifications", () => {
  it("delivers a signed webhook and records SENT", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const task = await makeTask(WEBHOOK);

    await notifyTaskEvent(task, "TASK_COMPLETED");

    const notices = await getRepository().listNotificationsByTask(task.id);
    expect(notices).toHaveLength(1);
    expect(notices[0].status).toBe("SENT");
    expect(notices[0].channel).toBe("webhook");

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-AgentHub-Signature"]).toMatch(/^sha256=/);
  });

  it("retries and records FAILED when the webhook errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const task = await makeTask(WEBHOOK);

    await notifyTaskEvent(task, "TASK_FAILED");

    const notices = await getRepository().listNotificationsByTask(task.id);
    expect(notices[0].status).toBe("FAILED");
    expect(notices[0].attempts).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("records SKIPPED when no webhook is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const task = await makeTask(null);

    await notifyTaskEvent(task, "TASK_COMPLETED");

    const notices = await getRepository().listNotificationsByTask(task.id);
    expect(notices[0].status).toBe("SKIPPED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
