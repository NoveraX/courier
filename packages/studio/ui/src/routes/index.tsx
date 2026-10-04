import { createFileRoute } from "@tanstack/react-router";

import { WelcomeView } from "@/views/welcome";
import { validateWelcomeSearch } from "@/views/welcome/welcome-search";

export const Route = createFileRoute("/")({
  component: WelcomeView,
  validateSearch: validateWelcomeSearch,
});
