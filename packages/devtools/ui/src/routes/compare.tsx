import { createFileRoute } from "@tanstack/react-router";
import { CompareView } from "../views/compare";
import { TabSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/compare")({
  component: CompareView,
  pendingComponent: TabSkeleton,
});
