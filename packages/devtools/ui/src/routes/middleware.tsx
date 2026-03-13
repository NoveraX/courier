import { createFileRoute } from "@tanstack/react-router";
import { MiddlewareView } from "../views/middleware";
import { TabSkeleton } from "../components/skeleton";

export interface MiddlewareSearchParams {
  request?: string;
}

function validateSearch(raw: Record<string, unknown>): MiddlewareSearchParams {
  return {
    request: typeof raw.request === "string" ? raw.request : undefined,
  };
}

export const Route = createFileRoute("/middleware")({
  component: MiddlewareView,
  pendingComponent: TabSkeleton,
  validateSearch,
});
