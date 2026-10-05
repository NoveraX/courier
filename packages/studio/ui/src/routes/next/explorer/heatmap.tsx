import { createFileRoute } from "@tanstack/react-router";

import { HeatmapScreen } from "@/screens/explorer/heatmap-screen";

export const Route = createFileRoute("/next/explorer/heatmap")({
  component: HeatmapScreen,
});
