import { createFileRoute } from "@tanstack/react-router";

import { WelcomeView } from "@/views/welcome";

function validateWelcomeSearch(search: Record<string, unknown>): { framework?: string } {
  const fw = search.framework;
  return { framework: typeof fw === "string" ? fw : undefined };
}

export const Route = createFileRoute("/")({
  component: WelcomeView,
  validateSearch: validateWelcomeSearch,
});
