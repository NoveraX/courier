import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared";

export default defineProject({
  test: { ...sharedTestOptions },
});
