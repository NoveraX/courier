import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

export default defineProject({
  resolve: {
    /* Solid's own packages load only through a bundler that takes their `solid` export and
       compiles their JSX, as an app's Vite does. TanStack Start for Solid's server entry is
       TanStack Start's server core, re-exported, and the tests of `/solid` take that core. */
    alias: { "@tanstack/solid-start/server": "@tanstack/start-server-core" },
  },
  test: { ...sharedTestOptions },
});
