import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
      /* "/" is a route of its own rather than an index, so a form posts to it as to SvelteKit's. */
      ignoredRouteFiles: ["**/*"],
      routes: (defineRoutes) =>
        defineRoutes((route) => {
          route("/", "routes/home.tsx");
          route("attack", "routes/attack.tsx");
          route("attack-login", "routes/attack-login.tsx");
          route("renew", "routes/renew.tsx");
          route("logout", "routes/logout.tsx");
          route("rename-route", "routes/rename-route.ts");
        }),
    }),
  ],
});
