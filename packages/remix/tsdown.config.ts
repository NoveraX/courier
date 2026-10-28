import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    plugin: "src/plugin.ts",
    "request-context": "src/request-context.ts",
  },
});
