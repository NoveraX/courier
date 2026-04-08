import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: {
    entry: {
      index: "src/index.ts",
    },
  },
  clean: true,
  splitting: true,
});
