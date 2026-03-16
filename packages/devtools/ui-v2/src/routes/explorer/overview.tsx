import { createFileRoute } from "@tanstack/react-router";
import { OverviewDashboard } from "@/views/explorer/overview";

export const Route = createFileRoute("/explorer/overview")({
  component: OverviewDashboard,
});
