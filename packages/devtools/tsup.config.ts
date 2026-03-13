import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server/index.ts",
    cli: "src/cli.ts",
    vite: "src/plugins/vite.ts",
    next: "src/plugins/next.ts",
    nuxt: "src/plugins/nuxt.ts",
    webpack: "src/plugins/webpack.ts",
    esbuild: "src/plugins/esbuild.ts",
    rollup: "src/plugins/rollup.ts",
    astro: "src/plugins/astro.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: {
    entry: {
      index: "src/index.ts",
      server: "src/server/index.ts",
      vite: "src/plugins/vite.ts",
      next: "src/plugins/next.ts",
      nuxt: "src/plugins/nuxt.ts",
      webpack: "src/plugins/webpack.ts",
      esbuild: "src/plugins/esbuild.ts",
      rollup: "src/plugins/rollup.ts",
      astro: "src/plugins/astro.ts",
    },
  },
  clean: true,
  splitting: true,
});
