import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    "config/index": "src/config/index.ts",
    "vite/index": "src/vite/index.ts",
    /* Started as a process of its own by the engine, which finds it at this path. */
    "engine/worker": "src/engine/worker.ts",
  },
});
