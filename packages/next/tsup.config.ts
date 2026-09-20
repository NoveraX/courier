import { defineConfig } from "tsup";

import { dtsCompilerOptions } from "../../tsup.shared";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    actions: "src/actions.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: { compilerOptions: dtsCompilerOptions },
  clean: true,
  splitting: true,
});
