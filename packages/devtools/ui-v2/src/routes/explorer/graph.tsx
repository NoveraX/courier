import { createFileRoute } from "@tanstack/react-router";

function GraphPage(): React.ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground">
      Graph view
    </div>
  );
}

export const Route = createFileRoute("/explorer/graph")({
  component: GraphPage,
});
