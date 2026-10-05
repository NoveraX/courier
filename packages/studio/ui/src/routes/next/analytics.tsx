import { createFileRoute } from "@tanstack/react-router";

import { validateAnalyticsSearch } from "@/features/analytics/analytics-search";
import { AnalyticsScreen } from "@/screens/analytics/analytics-screen";

export const Route = createFileRoute("/next/analytics")({
  component: AnalyticsScreen,
  validateSearch: validateAnalyticsSearch,
});
