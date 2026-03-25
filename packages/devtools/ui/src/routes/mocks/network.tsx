import { createFileRoute } from "@tanstack/react-router";
import { MockNetworkView } from "@/views/mocks/network";

export const Route = createFileRoute("/mocks/network")({
  component: MockNetworkView,
});
