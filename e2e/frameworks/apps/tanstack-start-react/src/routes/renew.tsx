import { createFileRoute } from "@tanstack/react-router";

import { getRenewed } from "../lib/session";

export const Route = createFileRoute("/renew")({ loader: () => getRenewed(), component: Renew });

function Renew() {
  return <pre id="renew">{JSON.stringify(Route.useLoaderData())}</pre>;
}
