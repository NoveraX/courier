import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

/* Parcel loads a transformer with require(), so the package is CommonJS; the engine it hands the work to is an ES module, imported. */
export default defineConfig({
  ...sharedBuild,
  entry: { index: "src/index.ts" },
  format: ["cjs"],
  outExtensions: () => ({ js: ".cjs", dts: ".d.cts" }),
});
