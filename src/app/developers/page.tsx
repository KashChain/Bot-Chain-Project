import { DevelopersClient } from "./DevelopersClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developer console — AgentHub AI",
  description: "Manage API keys, platform credits and subscriptions for AgentHub AI.",
};

export default function DevelopersPage() {
  return <DevelopersClient />;
}
