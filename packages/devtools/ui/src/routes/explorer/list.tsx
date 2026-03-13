import { createFileRoute } from "@tanstack/react-router";
import { useExplorerContext } from "../../views/explorer/explorer-context";
import { ListView } from "../../views/explorer/list-view";

function ExplorerListRoute() {
  const { sourceMap, onSelectEndpoint } = useExplorerContext();

  return <ListView sourceMap={sourceMap} onSelectEndpoint={onSelectEndpoint} />;
}

export const Route = createFileRoute("/explorer/list")({
  component: ExplorerListRoute,
});
