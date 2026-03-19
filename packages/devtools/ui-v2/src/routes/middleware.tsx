import { createFileRoute } from "@tanstack/react-router";

import { MiddlewareView } from "@/views/middleware";
import { validateMiddlewareSearch } from "@/views/middleware/search-schema";

export const Route = createFileRoute("/middleware")({
  component: MiddlewareView,
  validateSearch: validateMiddlewareSearch,
});
