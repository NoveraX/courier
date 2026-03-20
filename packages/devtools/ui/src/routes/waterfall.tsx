import { createFileRoute } from "@tanstack/react-router";

import { WaterfallView } from "@/views/waterfall";
import { validateWaterfallSearch } from "@/views/waterfall/search-schema";

export const Route = createFileRoute("/waterfall")({
  component: WaterfallView,
  validateSearch: validateWaterfallSearch,
});
