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
    "auto/schema-introspect": "src/auto/schema-introspect/index.ts",
    "auto/data-generator": "src/auto/data-generator/index.ts",
    "auto/meta-worker": "src/auto/meta-worker.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
});
