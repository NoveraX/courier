import { createFileRoute } from "@tanstack/react-router";

import { EndpointsScreen } from "@/screens/explorer/endpoints-screen";

export const Route = createFileRoute("/explorer/endpoints")({
  component: EndpointsScreen,
});
