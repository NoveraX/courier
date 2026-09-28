import { createRouter } from "@tanstack/react-router";

import { studioToken } from "./lib/studio-token";
import { routeTree } from "./routeTree.gen";

/* The link's token leaves the address before the router reads it, so no
   navigation writes it back. */
studioToken();

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
