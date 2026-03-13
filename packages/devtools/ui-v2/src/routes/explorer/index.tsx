import { createFileRoute } from "@tanstack/react-router";
import { Network } from "lucide-react";

function ExplorerPage(): React.ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-12 items-center justify-center rounded-xl bg-accent-brand/10">
        <Network className="size-6 text-accent-brand" />
      </div>
      <div className="text-center">
        <h2 className="text-h2 text-foreground">Explorer</h2>
        <p className="text-body-sm text-muted-foreground mt-1">
          API topology and endpoint discovery
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/explorer/")({
  component: ExplorerPage,
});
