import { createFileRoute } from "@tanstack/react-router";
import { TimelineView } from "../views/timeline";
import { TabSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/timeline")({
  component: TimelineView,
  pendingComponent: TabSkeleton,
});
