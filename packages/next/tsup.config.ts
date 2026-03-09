import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    actions: "src/actions.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
});
