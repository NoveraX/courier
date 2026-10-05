import { createFileRoute } from "@tanstack/react-router";

import { MocksDashboard } from "@/screens/mocks/mocks-dashboard";

export const Route = createFileRoute("/next/mocks/")({
  component: MocksDashboard,
});
