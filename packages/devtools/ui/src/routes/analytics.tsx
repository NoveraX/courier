import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsView } from "@/views/analytics";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsView,
});
