import { createFileRoute } from "@tanstack/react-router";

import { validateWelcomeSearch } from "@/features/welcome/welcome-search";
import { WelcomeScreen } from "@/screens/welcome/welcome-screen";

export const Route = createFileRoute("/next/")({
  component: WelcomeScreen,
  validateSearch: validateWelcomeSearch,
});
