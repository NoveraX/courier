import { createFileRoute } from "@tanstack/solid-router";

import { signInForAnotherSite } from "../lib/session";

export const Route = createFileRoute("/attack-login")({
  loader: () => signInForAnotherSite(),
  component: AttackLogin,
});

function AttackLogin() {
  const written = Route.useLoaderData();
  return <pre id="outcome">{written()}</pre>;
}
