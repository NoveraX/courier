import { createFileRoute } from "@tanstack/react-router";

function ListPage(): React.ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground">
      List view
    </div>
  );
}

export const Route = createFileRoute("/explorer/list")({
  component: ListPage,
});
