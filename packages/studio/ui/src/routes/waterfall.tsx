import { createFileRoute } from "@tanstack/react-router";

import { validateWaterfallSearch } from "@/features/waterfall/waterfall-search";
import { WaterfallScreen } from "@/screens/waterfall/waterfall-screen";

export const Route = createFileRoute("/waterfall")({
  component: WaterfallScreen,
  validateSearch: validateWaterfallSearch,
});
