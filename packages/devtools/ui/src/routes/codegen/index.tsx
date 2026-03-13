import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/codegen/")({
  beforeLoad: () => {
    throw redirect({ to: "/codegen/registry" });
  },
});
