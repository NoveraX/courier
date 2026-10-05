import { createFileRoute } from "@tanstack/react-router";

import { validateMiddlewareSearch } from "@/features/middleware/middleware-search";
import { MiddlewareScreen } from "@/screens/middleware/middleware-screen";

export const Route = createFileRoute("/next/middleware")({
  component: MiddlewareScreen,
  validateSearch: validateMiddlewareSearch,
});
