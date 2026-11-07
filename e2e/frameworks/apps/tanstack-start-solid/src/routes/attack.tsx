import { createFileRoute } from "@tanstack/solid-router";

import { renameForAnotherSite } from "../lib/session";

export const Route = createFileRoute("/attack")({
  loader: () => renameForAnotherSite(),
  component: Attack,
});

function Attack() {
  const written = Route.useLoaderData();
  return <pre id="outcome">{written()}</pre>;
}
