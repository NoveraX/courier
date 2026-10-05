import { createFileRoute } from "@tanstack/react-router";

import { validateMockScenariosSearch } from "@/features/mocks/scenario-view";
import { MockScenariosScreen } from "@/screens/mocks/scenarios-screen";

export const Route = createFileRoute("/next/mocks/scenarios")({
  component: MockScenariosScreen,
  validateSearch: validateMockScenariosSearch,
});
