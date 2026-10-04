import { createFileRoute } from "@tanstack/react-router";

import { validateInspectorSearch } from "@/features/requests/inspector-search";
import { StudioShell } from "@/shell/studio-shell";

export const Route = createFileRoute("/next")({
  component: StudioShell,
  validateSearch: validateInspectorSearch,
});
