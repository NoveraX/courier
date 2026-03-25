import { createFileRoute } from "@tanstack/react-router";

function UpdatePage(): React.ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground">
      API Update
    </div>
  );
}

export const Route = createFileRoute("/apis/update")({
  component: UpdatePage,
});
