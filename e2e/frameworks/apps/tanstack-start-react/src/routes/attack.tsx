import { createFileRoute } from "@tanstack/react-router";

import { renameForAnotherSite } from "../lib/session";

export const Route = createFileRoute("/attack")({
  loader: () => renameForAnotherSite(),
  component: Attack,
});

function Attack() {
  return <pre id="outcome">{Route.useLoaderData()}</pre>;
}
