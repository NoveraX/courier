import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "define/index": "src/define/index.ts",
    "middleware/index": "src/middleware/index.ts",
    node: "src/node.ts",
    "fetch/index": "src/fetch/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
});
