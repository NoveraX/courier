import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
});
