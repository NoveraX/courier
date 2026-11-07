import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    react: "src/react.ts",
    solid: "src/solid.ts",
    plugin: "src/plugin.ts",
    rsbuild: "src/rsbuild.ts",
  },
});
