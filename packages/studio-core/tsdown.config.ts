import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "runtime/browser": "src/runtime/browser.ts",
    "runtime/load-config": "src/runtime/load-config.ts",
  },
});
