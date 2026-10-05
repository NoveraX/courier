import { createFileRoute } from "@tanstack/react-router";

import { validatePlaygroundSearch } from "@/features/playground/playground-search";
import { PlaygroundScreen } from "@/screens/playground/playground-screen";

export const Route = createFileRoute("/next/playground")({
  component: PlaygroundScreen,
  validateSearch: validatePlaygroundSearch,
});
