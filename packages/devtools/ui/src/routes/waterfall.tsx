import { createFileRoute } from "@tanstack/react-router";
import { WaterfallView } from "../views/waterfall";
import { TabSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/waterfall")({
  component: WaterfallView,
  pendingComponent: TabSkeleton,
});
