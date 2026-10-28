import { courierRoutes } from "@noverax/courier-solid/plugin";
import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [solidStart(), nitro(), courierRoutes()] });
