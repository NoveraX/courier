import { createFileRoute } from "@tanstack/react-router";

import { GraphScreen } from "@/screens/explorer/graph-screen";

export const Route = createFileRoute("/next/explorer/")({
  component: GraphScreen,
});
