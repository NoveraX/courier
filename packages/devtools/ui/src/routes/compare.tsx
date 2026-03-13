import { createFileRoute } from "@tanstack/react-router";
import { CompareView } from "../views/compare";
import { TabSkeleton } from "../components/skeleton";

import type { CompareTab } from "../store";

export interface CompareSearchParams {
  left?: string;
  right?: string;
  tab?: CompareTab;
}

function validateSearch(raw: Record<string, unknown>): CompareSearchParams {
  const validTabs = ["payload", "response", "headers", "timing"];
  return {
    left: typeof raw.left === "string" ? raw.left : undefined,
    right: typeof raw.right === "string" ? raw.right : undefined,
    tab: typeof raw.tab === "string" && validTabs.includes(raw.tab)
      ? raw.tab as CompareTab
      : undefined,
  };
}

export const Route = createFileRoute("/compare")({
  component: CompareView,
  pendingComponent: TabSkeleton,
  validateSearch,
});
