import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: { cli: "src/cli.ts" },
  /* An executable, not an importable surface: no declarations. */
  dts: false,
});
