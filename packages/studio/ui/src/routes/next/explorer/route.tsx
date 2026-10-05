import { createFileRoute } from "@tanstack/react-router";

import { validateExplorerSearch } from "@/features/explorer/explorer-search";
import { ExplorerLayout } from "@/screens/explorer/explorer-layout";

export const Route = createFileRoute("/next/explorer")({
  component: ExplorerLayout,
  validateSearch: validateExplorerSearch,
});
