import { createRouter } from "@tanstack/react-router";
import { bridgeToEditorHost } from "./features/editor/editor-bridge";
import { studioToken } from "./lib/studio-token";
import { routeTree } from "./routeTree.gen";
import { RouteErrorScreen } from "./screens/route-error-screen";

/* The link's token leaves the address before the router reads it, so no
   navigation writes it back. */
studioToken();

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: RouteErrorScreen,
});

bridgeToEditorHost(router);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
