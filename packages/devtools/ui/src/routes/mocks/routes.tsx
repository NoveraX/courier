import { createFileRoute } from "@tanstack/react-router";
import { MockRoutesView } from "@/views/mocks/routes";

export const Route = createFileRoute("/mocks/routes")({
  component: MockRoutesView,
});
