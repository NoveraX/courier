import { createFileRoute } from "@tanstack/react-router";

import { CompareView } from "@/views/compare";
import { validateCompareSearch } from "@/views/compare/search-schema";

export const Route = createFileRoute("/compare")({
  component: CompareView,
  validateSearch: validateCompareSearch,
});
