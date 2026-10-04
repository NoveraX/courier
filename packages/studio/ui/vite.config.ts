import path from "node:path";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { thirdPartyLicenses } from "../../../scripts/third-party-licenses";

/* Paths resolve from this directory, not from wherever the build is run. */
const uiDir = import.meta.dirname;

export default defineConfig({
  root: uiDir,
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: path.join(uiDir, "src/routes"),
      generatedRouteTree: path.join(uiDir, "src/routeTree.gen.ts"),
    }),
    /* The React Compiler runs natively through oxc-transform-react, in the
       same pass that strips types and transforms JSX. */
    react({ compiler: true }),
    tailwindcss(),
    /* The bundle carries other packages' code and the Geist fonts; their
       licences ship beside it. */
    thirdPartyLicenses("Courier Studio's interface"),
  ],
  resolve: {
    alias: {
      "@": path.resolve(uiDir, "./src"),
    },
  },
  server: {
    port: 4382,
    proxy: {
      "/api/": "http://localhost:6280",
      "/socket.io": {
        target: "http://localhost:6280",
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
          return undefined;
        },
      },
    },
  },
});
