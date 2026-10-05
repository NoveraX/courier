import { createFileRoute } from "@tanstack/react-router";

import { OverviewScreen } from "@/screens/explorer/overview-screen";

export const Route = createFileRoute("/explorer/overview")({
  component: OverviewScreen,
});
