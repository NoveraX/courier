import { createFileRoute } from "@tanstack/react-router";

import { PlaygroundView } from "@/views/playground";

interface PlaygroundSearch {
  source?: string;
  group?: string;
  method?: string;
}

export const Route = createFileRoute("/playground")({
  component: PlaygroundView,
  validateSearch: (search: Record<string, unknown>): PlaygroundSearch => ({
    source: typeof search.source === "string" ? search.source : undefined,
    group: typeof search.group === "string" ? search.group : undefined,
    method: typeof search.method === "string" ? search.method : undefined,
  }),
});
