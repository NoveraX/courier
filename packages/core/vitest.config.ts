import { configDefaults, defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

export default defineProject({
  /* Tests in a context of their own run in the project of
     vitest.vm-context.config.ts. */
  test: { ...sharedTestOptions, exclude: [...configDefaults.exclude, "tests/vm-context/**"] },
});
