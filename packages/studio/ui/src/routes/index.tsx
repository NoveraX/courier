import { createFileRoute } from "@tanstack/react-router";
import { validateWelcomeSearch } from "@/features/welcome/welcome-search";
import { WelcomeView } from "@/views/welcome";

export const Route = createFileRoute("/")({
  component: WelcomeView,
  validateSearch: validateWelcomeSearch,
});
