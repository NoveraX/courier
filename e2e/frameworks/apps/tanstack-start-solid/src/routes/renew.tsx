import { createFileRoute } from "@tanstack/solid-router";

import { getRenewed } from "../lib/session";

export const Route = createFileRoute("/renew")({ loader: () => getRenewed(), component: Renew });

function Renew() {
  const both = Route.useLoaderData();
  return <pre id="renew">{JSON.stringify(both())}</pre>;
}
