import { createFileRoute } from "@tanstack/react-router";
import { HeatmapPage } from "@/views/explorer/heatmap";

export const Route = createFileRoute("/explorer/heatmap")({
  component: HeatmapPage,
});
