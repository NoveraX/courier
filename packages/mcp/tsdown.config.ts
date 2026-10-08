import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  /* The CLI is an executable, not an importable surface — no declarations. */
  dts: { ...sharedBuild.dts, entry: "src/index.ts" },
});
