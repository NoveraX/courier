import { createFileRoute } from "@tanstack/react-router";

import { signInForAnotherSite } from "../lib/session";

export const Route = createFileRoute("/attack-login")({
  loader: () => signInForAnotherSite(),
  component: AttackLogin,
});

function AttackLogin() {
  return <pre id="outcome">{Route.useLoaderData()}</pre>;
}
