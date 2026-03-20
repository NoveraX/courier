import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { validateExplorerSearch } from "@/views/explorer/use-explorer-search";
import { ExplorerGraph } from "@/views/explorer/graph";

function GraphPage(): React.ReactNode {
  return (
    <ReactFlowProvider>
      <ExplorerGraph />
    </ReactFlowProvider>
  );
}

export const Route = createFileRoute("/explorer/graph")({
  component: GraphPage,
  validateSearch: validateExplorerSearch,
});
