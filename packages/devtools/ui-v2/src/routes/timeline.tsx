import { createFileRoute } from "@tanstack/react-router";

function TimelinePage() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-accent-brand/10 border border-accent-brand/20">
        <span className="text-2xl font-bold text-accent-brand">N</span>
      </div>
      <h1 className="text-h1 text-foreground">Nexus DevTools v2</h1>
      <p className="text-body text-muted-foreground">
        Premium enterprise-grade DevTools UI
      </p>
    </div>
  );
}

export const Route = createFileRoute("/timeline")({
  component: TimelinePage,
});
