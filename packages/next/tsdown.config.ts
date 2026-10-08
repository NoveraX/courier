import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    actions: "src/actions.ts",
    pages: "src/pages.ts",
    middleware: "src/middleware.ts",
  },
});
