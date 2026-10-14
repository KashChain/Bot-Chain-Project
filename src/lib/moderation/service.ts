import { NotFoundError } from "../errors";
import { getRepository, type AgentRecord, type ReportRecord } from "../repo";
import type { ReportStatus } from "../escrow-state";

export type ModerationAction = "dismiss" | "suspend" | "ban";

const ACTION_STATUS: Record<ModerationAction, ReportStatus> = {
  dismiss: "DISMISSED",
  suspend: "SUSPENDED",
  ban: "BANNED",
};

export interface CreateReportRequest {
  reporterAddress: string;
  reason: string;
  details?: string | null;
}

export async function reportAgent(
  agentId: string,
  request: CreateReportRequest,
): Promise<ReportRecord> {
  const repo = getRepository();
  const agent = await repo.getAgentById(agentId);
  if (!agent) throw new NotFoundError("Agent not found");
  return repo.createReport({
    agentId: agent.id,
    reporterAddress: request.reporterAddress,
    reason: request.reason,
    details: request.details ?? null,
  });
}

export async function listReportQueue(status?: ReportStatus): Promise<ReportRecord[]> {
  return getRepository().listReports(status);
}

export async function resolveReport(
  reportId: string,
  action: ModerationAction,
  reviewer: string,
): Promise<{ report: ReportRecord; agent: AgentRecord | null }> {
  const repo = getRepository();
  const report = await repo.getReport(reportId);
  if (!report) throw new NotFoundError("Report not found");

  const reportStatus = ACTION_STATUS[action];
  const updatedReport = await repo.updateReport(reportId, {
    status: reportStatus,
    reviewedBy: reviewer,
    resolvedAt: new Date(),
  });

  let agent: AgentRecord | null = null;
  if (action === "suspend" || action === "ban") {
    const agentStatus = action === "ban" ? "BANNED" : "SUSPENDED";
    agent = await repo.updateAgent(report.agentId, {
      status: agentStatus,
      active: false,
    });
  }

  return { report: updatedReport, agent };
}
