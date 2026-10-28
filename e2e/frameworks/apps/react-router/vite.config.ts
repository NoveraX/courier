import { courierRoutes } from "@noverax/courier-remix/plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [reactRouter(), courierRoutes()] });
