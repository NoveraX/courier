import { createFileRoute } from "@tanstack/react-router";

import { validateTimelineSearch } from "@/features/requests/timeline-search";
import { TimelineScreen } from "@/screens/timeline/timeline-screen";

export const Route = createFileRoute("/next/timeline")({
  component: TimelineScreen,
  validateSearch: validateTimelineSearch,
});
