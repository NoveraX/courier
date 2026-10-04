import { createFileRoute } from "@tanstack/react-router";

import { StudioShell } from "@/shell/studio-shell";

export const Route = createFileRoute("/next")({
  component: StudioShell,
});
