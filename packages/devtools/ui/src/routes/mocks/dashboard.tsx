import { createFileRoute } from "@tanstack/react-router";
import { MockDashboardView } from "@/views/mocks/dashboard";

export const Route = createFileRoute("/mocks/dashboard")({
  component: MockDashboardView,
});
