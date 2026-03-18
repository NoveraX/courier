import { createFileRoute } from "@tanstack/react-router";

import { PlaygroundView } from "@/views/playground";

export const Route = createFileRoute("/playground")({
  component: PlaygroundView,
});
