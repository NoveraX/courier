import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TimelineView } from "../views/timeline";
import { TabSkeleton } from "../components/skeleton";

import type { RequestStatus } from "../store";

export interface TimelineSearchParams {
  request?: string;
  search?: string;
  status?: RequestStatus[];
  mode?: ("direct" | "proxy")[];
  type?: ("query" | "mutation")[];
  method?: string[];
  source?: string[];
  group?: string[];
  minDuration?: number;
  filters?: boolean;
}

const DEFAULTS: TimelineSearchParams = {
  request: undefined,
  search: "",
  status: [],
  mode: [],
  type: [],
  method: [],
  source: [],
  group: [],
  minDuration: undefined,
  filters: false,
};

function validateSearch(raw: Record<string, unknown>): TimelineSearchParams {
  return {
    request: typeof raw.request === "string" ? raw.request : undefined,
    search: typeof raw.search === "string" ? raw.search : "",
    status: Array.isArray(raw.status) ? raw.status as RequestStatus[] : [],
    mode: Array.isArray(raw.mode) ? raw.mode as ("direct" | "proxy")[] : [],
    type: Array.isArray(raw.type) ? raw.type as ("query" | "mutation")[] : [],
    method: Array.isArray(raw.method) ? raw.method as string[] : [],
    source: Array.isArray(raw.source) ? raw.source as string[] : [],
    group: Array.isArray(raw.group) ? raw.group as string[] : [],
    minDuration: typeof raw.minDuration === "number" ? raw.minDuration : undefined,
    filters: raw.filters === true,
  };
}

export const Route = createFileRoute("/timeline")({
  component: TimelineView,
  pendingComponent: TabSkeleton,
  validateSearch,
  search: { middlewares: [stripSearchParams(DEFAULTS)] },
});
