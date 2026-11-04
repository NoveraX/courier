import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: { cli: "src/cli.ts", "set-up-routes": "src/set-up-routes.ts" },
  /* The command is run, not imported: only the routes' setup, which `courier-cli setup` imports, has declarations. */
  dts: { ...sharedBuild.dts, entry: ["src/set-up-routes.ts"] },
});
