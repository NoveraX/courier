import { createFileRoute } from "@tanstack/react-router";

import { TimelineView } from "@/views/timeline";
import { validateTimelineSearch } from "@/views/timeline/search-schema";

export const Route = createFileRoute("/timeline")({
  component: TimelineView,
  validateSearch: validateTimelineSearch,
});
