import { createFileRoute } from "@tanstack/react-router";

import { ApisScreen } from "@/screens/apis/apis-screen";

export const Route = createFileRoute("/next/apis")({
  component: ApisScreen,
});
