import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    server: "src/server/index.ts",
    cli: "src/cli.ts",
    "mock-worker": "src/server/mock-manager/mock-worker.ts",
    "format-worker": "src/server/project-format/format-worker.ts",
    "spec-worker": "src/server/spec-jobs/spec-worker.ts",
    vite: "src/plugins/vite.ts",
    next: "src/plugins/next.ts",
    nuxt: "src/plugins/nuxt.ts",
    webpack: "src/plugins/webpack.ts",
    esbuild: "src/plugins/esbuild.ts",
    rollup: "src/plugins/rollup.ts",
    astro: "src/plugins/astro.ts",
    react: "src/plugins/react.ts",
    vue: "src/plugins/vue.ts",
    sveltekit: "src/plugins/sveltekit.ts",
    remix: "src/plugins/remix.ts",
    solid: "src/plugins/solid.ts",
    angular: "src/plugins/angular.ts",
  },
});
