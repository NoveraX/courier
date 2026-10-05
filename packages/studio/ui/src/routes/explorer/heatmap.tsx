import { createFileRoute } from "@tanstack/react-router";

import { HeatmapScreen } from "@/screens/explorer/heatmap-screen";

export const Route = createFileRoute("/explorer/heatmap")({
  component: HeatmapScreen,
});
