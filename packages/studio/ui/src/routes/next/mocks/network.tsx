import { createFileRoute } from "@tanstack/react-router";

import { MockNetworkScreen } from "@/screens/mocks/network-screen";

export const Route = createFileRoute("/next/mocks/network")({
  component: MockNetworkScreen,
});
