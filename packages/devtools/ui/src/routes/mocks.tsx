import { createFileRoute } from "@tanstack/react-router";
import { MockLayout } from "@/views/mocks/shared/mock-layout";

export const Route = createFileRoute("/mocks")({
  component: MockLayout,
});
