import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

const entry = {
  index: "src/index.ts",
  "config/index": "src/config/index.ts",
  "define/index": "src/define/index.ts",
  "middleware/index": "src/middleware/index.ts",
  node: "src/node.ts",
  "fetch/index": "src/fetch/index.ts",
  "testing/index": "src/testing/index.ts",
  "openapi/index": "src/openapi/index.ts",
  "webhooks/index": "src/webhooks/index.ts",
  "realtime/index": "src/realtime/index.ts",
  "internal-streams/index": "src/internal-streams/index.ts",
  "internal/index": "src/internal/index.ts",
  "announce/index": "src/announce/index.ts",
};

export default defineConfig([
  {
    ...sharedBuild,
    entry,
    /* One JavaScript file per module, as the sources are: an app's bundler
       then splits and drops the core module by module, where shared chunks
       made a browser load at start what it needs only later or never, and a
       stack trace names the module each frame is in. */
    unbundle: true,
    dts: false,
  },
  {
    ...sharedBuild,
    entry,
    /* The declarations stay bundled per entry point. There a type only the
       core's own modules use is local to its chunk, and a project emitting
       declarations of its own writes it out; one file per module would
       export it from a path the package's exports do not reach, and stop
       that project with TS2883. */
    dts: { ...sharedBuild.dts, emitDtsOnly: true },
  },
]);
