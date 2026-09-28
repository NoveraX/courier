import { createFileRoute } from "@tanstack/react-router";

import { ApisView } from "@/views/apis";

export const Route = createFileRoute("/apis")({
  component: ApisView,
});
