import { createFileRoute, Navigate } from "@tanstack/react-router";

function ExplorerIndex(): React.ReactNode {
  return <Navigate to="/explorer/graph" replace />;
}

export const Route = createFileRoute("/explorer/")({
  component: ExplorerIndex,
});
