import { createFileRoute } from "@tanstack/react-router";
import { MockLogsView } from "@/views/mocks/logs";

export const Route = createFileRoute("/mocks/logs")({
  component: MockLogsView,
});
