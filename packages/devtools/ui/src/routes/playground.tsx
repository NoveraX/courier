import { createFileRoute } from "@tanstack/react-router";
import { PlaygroundView } from "../views/playground";
import { TabSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/playground")({
  component: PlaygroundView,
  pendingComponent: TabSkeleton,
});
