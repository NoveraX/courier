import { courierRoutes } from "@noverax/courier-build/vite";
import { defineConfig } from "vitest/config";

/* A project's own Vitest, with the plugin that hands its tests the routes. */
export default defineConfig({
  plugins: [courierRoutes()],
  test: { include: ["src/**/*.test.ts"] },
});
