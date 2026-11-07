import { courierRoutes } from "@noverax/courier-tanstack-start/plugin";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteSolid from "vite-plugin-solid";

export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteSolid({ ssr: true }), courierRoutes()],
});
