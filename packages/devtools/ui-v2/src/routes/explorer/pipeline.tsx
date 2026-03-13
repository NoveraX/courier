import { createFileRoute } from "@tanstack/react-router";

function PipelinePage(): React.ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground">
      Pipeline view
    </div>
  );
}

export const Route = createFileRoute("/explorer/pipeline")({
  component: PipelinePage,
});
