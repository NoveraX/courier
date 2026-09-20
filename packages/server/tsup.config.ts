import { defineConfig } from "tsup";

import { dtsCompilerOptions } from "../../tsup.shared";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: {
    compilerOptions: dtsCompilerOptions,
    entry: {
      index: "src/index.ts",
    },
  },
  clean: true,
  splitting: true,
});
