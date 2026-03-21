import { createFileRoute } from "@tanstack/react-router";
import { MockStoreView } from "@/views/mocks/store";

export const Route = createFileRoute("/mocks/store")({
  component: MockStoreView,
});
