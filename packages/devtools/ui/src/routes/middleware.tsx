import { createFileRoute } from "@tanstack/react-router";
import { MiddlewareView } from "../views/middleware";
import { TabSkeleton } from "../components/skeleton";

export const Route = createFileRoute("/middleware")({
  component: MiddlewareView,
  pendingComponent: TabSkeleton,
});
