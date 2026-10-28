import { courierRoutes } from "@noverax/courier-solid/plugin";
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({ vite: { plugins: [courierRoutes()] } });
