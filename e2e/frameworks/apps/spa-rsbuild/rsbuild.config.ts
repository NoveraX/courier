import { courierRoutes } from "@noverax/courier-build/rsbuild";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

/* The single-page application built by Rsbuild in place of Vite, with Courier's routes plugin. */
export default defineConfig({
  plugins: [pluginReact(), courierRoutes()],
  source: { entry: { index: "./src/main.tsx" } },
  html: { title: "Session from the browser" },
});
