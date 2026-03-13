import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsView } from "../views/analytics";
import { GridSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsView,
  pendingComponent: GridSkeleton,
});
