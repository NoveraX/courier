import { createFileRoute } from "@tanstack/react-router";
import { MockScenariosView } from "@/views/mocks/scenarios";

export const Route = createFileRoute("/mocks/scenarios")({
  component: MockScenariosView,
});
