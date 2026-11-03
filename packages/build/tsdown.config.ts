import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig([
  {
    ...sharedBuild,
    entry: {
      index: "src/index.ts",
      "config/index": "src/config/index.ts",
      "vite/index": "src/vite/index.ts",
      "webpack/index": "src/webpack/index.ts",
      "rspack/index": "src/rspack/index.ts",
      "rsbuild/index": "src/rsbuild/index.ts",
      "esbuild/index": "src/esbuild/index.ts",
      "rollup/index": "src/rollup/index.ts",
      "metro/index": "src/metro/index.ts",
      /* Started as a process of its own by the engine, which finds it at this path. */
      "engine/worker": "src/engine/worker.ts",
      /* Imported by the routes loader, which finds it beside itself. */
      "webpack/run-routes-loader": "src/webpack/run-routes-loader.ts",
      /* Started as a thread by the Jest transformer, which finds it beside itself. */
      "jest/routes-thread": "src/jest/routes-thread.ts",
    },
  },
  {
    ...sharedBuild,
    /* webpack, Rspack and Turbopack load a loader as CommonJS, Jest a transformer, and
       most Metro configs require() what they take. */
    entry: {
      "webpack/loader": "src/webpack/loader.ts",
      "jest/transformer": "src/jest/routes-transformer.ts",
      "metro/index": "src/metro/require-entry.ts",
    },
    format: ["cjs"],
    outExtensions: () => ({ js: ".cjs", dts: ".d.cts" }),
    clean: false,
  },
]);
