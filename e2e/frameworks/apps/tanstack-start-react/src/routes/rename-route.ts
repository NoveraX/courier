import { createFileRoute } from "@tanstack/react-router";

import { outcome } from "../lib/accounts";
import { accounts } from "../lib/accounts.server";

export const Route = createFileRoute("/rename-route")({
  server: {
    handlers: {
      POST: async () => new Response(await outcome(accounts.rename({ name: "Route" }))),
    },
  },
});
