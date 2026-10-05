import { createFileRoute } from "@tanstack/react-router";

import { GraphScreen } from "@/screens/explorer/graph-screen";

export const Route = createFileRoute("/explorer/")({
  component: GraphScreen,
});
