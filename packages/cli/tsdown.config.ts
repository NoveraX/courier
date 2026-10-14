import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    devkit: "src/devkit.ts",
    cli: "src/cli.ts",
    "format-worker": "src/project-format/format-worker.ts",
    "job-memory-watch": "src/worker/job-memory-watch.ts",
  },
  /* The command and the worker scripts are run, not imported: only the devkit has declarations. */
  dts: { ...sharedBuild.dts, entry: ["src/devkit.ts"] },
});
