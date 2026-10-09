import { defineConfig } from "tsdown";

/*
 * VS Code loads an extension as one CommonJS file, `vscode` provided by the
 * editor itself; everything else is bundled in.
 */
export default defineConfig({
  entry: { extension: "src/extension.ts" },
  outDir: "dist",
  format: ["cjs"],
  platform: "node",
  target: "node20",
  external: ["vscode"],
  dts: false,
  clean: true,
  outExtensions: () => ({ js: ".cjs" }),
});
