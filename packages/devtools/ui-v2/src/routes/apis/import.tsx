import { createFileRoute } from "@tanstack/react-router";

function ImportPage(): React.ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground">
      Import wizard
    </div>
  );
}

export const Route = createFileRoute("/apis/import")({
  component: ImportPage,
});
