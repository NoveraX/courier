import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: { cli: "src/cli.ts", "set-up-routes": "src/set-up-routes.ts", engine: "src/engine.ts" },
  /* The command is run, not imported: only what Courier's CLI imports — the routes' setup and the engine — has declarations. */
  dts: { ...sharedBuild.dts, entry: ["src/set-up-routes.ts", "src/engine.ts"] },
});
