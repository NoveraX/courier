import { createFileRoute } from "@tanstack/react-router";

import { validateMockStoreSearch } from "@/features/mocks/collection-view";
import { MockStoreScreen } from "@/screens/mocks/store-screen";

export const Route = createFileRoute("/mocks/store")({
  component: MockStoreScreen,
  validateSearch: validateMockStoreSearch,
});
