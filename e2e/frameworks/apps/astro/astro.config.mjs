import node from "@astrojs/node";
import { courierRoutes } from "@noverax/courier-astro/plugin";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [courierRoutes()],
  /* Astro reads the request's host only from a domain it is told to trust;
     otherwise every URL is `http://localhost`, and its own origin check
     refuses the application's forms. */
  security: { allowedDomains: [{ hostname: "localhost" }] },
  telemetry: false,
});
