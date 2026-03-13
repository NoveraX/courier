import { createFileRoute } from "@tanstack/react-router";
import { useDevToolsStore } from "../../store";
import { useExplorerContext } from "../../views/explorer/explorer-context";
import { PipelineView } from "../../views/explorer/pipeline-view";

function ExplorerPipelineRoute() {
  const { sourceMap, onSelectEndpoint } = useExplorerContext();
  const { requests, explorerSelectedEndpoint } = useDevToolsStore();

  return (
    <PipelineView
      sourceMap={sourceMap}
      selected={explorerSelectedEndpoint}
      requests={requests}
      onSelectEndpoint={onSelectEndpoint}
    />
  );
}

export const Route = createFileRoute("/explorer/pipeline")({
  component: ExplorerPipelineRoute,
});
