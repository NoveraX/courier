import node from "@astrojs/node";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  /* Astro reads the request's host only from a domain it is told to trust;
     otherwise every URL is `http://localhost`, and its own origin check
     refuses the application's forms. */
  security: { allowedDomains: [{ hostname: "localhost" }] },
  telemetry: false,
});
