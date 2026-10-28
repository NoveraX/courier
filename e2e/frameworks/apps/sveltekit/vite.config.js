import { courierRoutes } from "@noverax/courier-sveltekit/plugin";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [sveltekit(), courierRoutes()] });
