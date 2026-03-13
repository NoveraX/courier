import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

function TimelinePage(): React.ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-12 items-center justify-center rounded-xl bg-accent-brand/10">
        <Activity className="size-6 text-accent-brand" />
      </div>
      <div className="text-center">
        <h2 className="text-h2 text-foreground">Timeline</h2>
        <p className="text-body-sm text-muted-foreground mt-1">
          Real-time request monitoring
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/timeline")({
  component: TimelinePage,
});
