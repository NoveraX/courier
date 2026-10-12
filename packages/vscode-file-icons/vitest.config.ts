import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

export default defineProject({
  test: {
    ...sharedTestOptions,
    /* The editor's API exists only inside VS Code: a stand-in takes its place. */
    alias: { vscode: fileURLToPath(new URL("./tests/vscode-stand-in.ts", import.meta.url)) },
  },
});
