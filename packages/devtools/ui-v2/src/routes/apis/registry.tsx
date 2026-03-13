import { createFileRoute } from "@tanstack/react-router";

function RegistryPage(): React.ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center text-body-sm text-muted-foreground">
      API Registry
    </div>
  );
}

export const Route = createFileRoute("/apis/registry")({
  component: RegistryPage,
});
