import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

export default defineProject({
  test: { ...sharedTestOptions },
});
