import { jsonOk } from "@/lib/api";
import { listPlans } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk({ plans: listPlans() });
}
