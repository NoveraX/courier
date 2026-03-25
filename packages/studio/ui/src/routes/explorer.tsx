import { createFileRoute } from "@tanstack/react-router";
import { ExplorerLayout } from "@/views/explorer/shared/explorer-layout";

export const Route = createFileRoute("/explorer")({
  component: ExplorerLayout,
});
