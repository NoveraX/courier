import { createFileRoute } from "@tanstack/react-router";

import { EndpointsScreen } from "@/screens/explorer/endpoints-screen";

export const Route = createFileRoute("/next/explorer/endpoints")({
  component: EndpointsScreen,
});
