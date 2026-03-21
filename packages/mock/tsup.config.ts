import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    browser: "src/browser.ts",
    "contract/index": "src/contract/index.ts",
    "middleware/index": "src/middleware/index.ts",
    "managed/worker-entry": "src/managed/worker-entry.ts",
    "auto/route-analyzer": "src/auto/route-analyzer.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
});
