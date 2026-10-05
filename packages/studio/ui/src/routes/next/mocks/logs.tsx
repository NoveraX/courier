import { createFileRoute } from "@tanstack/react-router";

import { validateMockLogsSearch } from "@/features/mocks/logs-view";
import { MockLogsScreen } from "@/screens/mocks/logs-screen";

export const Route = createFileRoute("/next/mocks/logs")({
  component: MockLogsScreen,
  validateSearch: validateMockLogsSearch,
});
