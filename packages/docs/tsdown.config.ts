import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: { cli: "src/cli.ts" },
  /* The command is all the package runs: the docs are read as files, and no module is imported. */
  dts: false,
});
