import { createFileRoute } from "@tanstack/react-router";

import { MocksLayout } from "@/screens/mocks/mocks-layout";

export const Route = createFileRoute("/next/mocks")({
  component: MocksLayout,
});
