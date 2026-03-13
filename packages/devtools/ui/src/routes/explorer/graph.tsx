import { createFileRoute } from "@tanstack/react-router";
import { useDevToolsStore } from "../../store";
import { useExplorerContext } from "../../views/explorer/explorer-context";
import { GraphView } from "../../views/explorer/graph-view";

function ExplorerGraphRoute() {
  const { sourceMap, onSelectEndpoint } = useExplorerContext();
  const { graphLayout, showSchemas } = useDevToolsStore();

  return (
    <GraphView
      sourceMap={sourceMap}
      layout={graphLayout}
      showSchemas={showSchemas}
      onSelectEndpoint={onSelectEndpoint}
    />
  );
}

export const Route = createFileRoute("/explorer/graph")({
  component: ExplorerGraphRoute,
});
