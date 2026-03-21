import path from "node:path";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 4382,
    proxy: {
      "/api/": "http://localhost:4380",
      "/socket.io": {
        target: "http://localhost:4380",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("@tanstack/react-router")) return "vendor-router";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("@xyflow/react")) return "vendor-flow";
          if (id.includes("motion")) return "vendor-motion";
          if (id.includes("shiki")) return "vendor-shiki";
          if (id.includes("sonner") || id.includes("react-resizable-panels") || id.includes("cmdk")) return "vendor-ui";
        },
      },
    },
  },
});
