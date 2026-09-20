import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    testing: "src/testing.ts",
    server: "src/server/index.ts",
    "contract/index": "src/contract/index.ts",
    "managed/worker-entry": "src/managed/worker-entry.ts",
    "auto/meta-worker": "src/auto/meta-worker.ts",
  },
  outDir: "lib",
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  /* Loaded lazily and declared as an optional peer, so it must stay a real
     import rather than being inlined into the bundle. */
  external: ["socket.io-client"],
});
