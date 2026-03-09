import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "define/index": "src/define/index.ts",
    "direct/index": "src/direct/index.ts",
    "middleware/index": "src/middleware/index.ts",
    node: "src/node.ts",
    "testing/index": "src/testing/index.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
});
