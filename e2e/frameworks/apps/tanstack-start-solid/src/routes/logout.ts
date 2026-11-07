import { createFileRoute } from "@tanstack/solid-router";

import { accounts } from "../lib/accounts.server";

export const Route = createFileRoute("/logout")({
  server: {
    handlers: {
      GET: async () => {
        await accounts.logout();
        return new Response(null, { status: 303, headers: { location: "/" } });
      },
    },
  },
});
