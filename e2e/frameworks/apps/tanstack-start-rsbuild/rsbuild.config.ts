import { courierRoutes } from "@noverax/courier-tanstack-start/rsbuild";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/rsbuild";

/* The React application built by Rsbuild in place of Vite, with Courier's routes plugin for it. */
export default defineConfig({ plugins: [pluginReact(), tanstackStart(), courierRoutes()] });
