import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/apis/")({
  beforeLoad: () => {
    throw redirect({ to: "/apis/registry" });
  },
});
