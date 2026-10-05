import { createFileRoute } from "@tanstack/react-router";

import { validateMockRoutesSearch } from "@/features/mocks/routes-view";
import { MockRoutesScreen } from "@/screens/mocks/routes-screen";

export const Route = createFileRoute("/mocks/routes")({
  component: MockRoutesScreen,
  validateSearch: validateMockRoutesSearch,
});
