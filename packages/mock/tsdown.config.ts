import { defineConfig } from "tsdown";

import { sharedBuild } from "../../tsdown.shared.ts";

export default defineConfig({
  ...sharedBuild,
  entry: {
    index: "src/index.ts",
    testing: "src/testing.ts",
    server: "src/server/index.ts",
    "contract/index": "src/contract/index.ts",
    "managed/index": "src/managed/index.ts",
  },
  /* Loaded lazily and declared as an optional peer, so it must stay a real
     import rather than being inlined into the bundle. */
  deps: { neverBundle: ["socket.io-client"] },
});
