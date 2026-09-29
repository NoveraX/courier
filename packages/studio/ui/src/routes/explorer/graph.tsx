import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { ExplorerGraph } from "@/views/explorer/graph";
import { validateExplorerSearch } from "@/views/explorer/use-explorer-search";

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
