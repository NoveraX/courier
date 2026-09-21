import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "runtime/load-config": "src/runtime/load-config.ts",
  },
});
