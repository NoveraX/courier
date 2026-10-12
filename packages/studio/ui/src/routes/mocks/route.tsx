import { createFileRoute } from "@tanstack/react-router";

import { requestShownMockStore } from "@/mocks/request-mock-store";
import { MocksLayout } from "@/screens/mocks/mocks-layout";

export const Route = createFileRoute("/mocks")({
  component: MocksLayout,
  /* Run as a link to the section is pointed at, as well as when it opens. */
  loader: requestShownMockStore,
});
