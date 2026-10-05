import { createFileRoute } from "@tanstack/react-router";

import { validateCompareSearch } from "@/features/compare/compare-search";
import { CompareScreen } from "@/screens/compare/compare-screen";

export const Route = createFileRoute("/next/compare")({
  component: CompareScreen,
  validateSearch: validateCompareSearch,
});
