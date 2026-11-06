/**
 * The Node APIs a bundle reads off the global `process` — anything but
 * `process.env` — told apart from a `process` of the code's own and from
 * text by the name the build's `define` gives the global.
 */
import { describe, expect, it } from "vitest";

import { GLOBAL_PROCESS, processReads } from "./process-reads.mjs";

describe("processReads", () => {
  it("names each module that reads a Node API off the global process, once per API", () => {
    const bundle = [
      "// packages/core/lib/utils/fetch-copies.js",
      `const FETCH_COPIES = fetchCopies(typeof ${GLOBAL_PROCESS} === "undefined" ? void 0 : ${GLOBAL_PROCESS}.versions?.undici);`,
      "// packages/core/lib/adapter/multipart/stale-uploads.js",
      `const prefix = \`courier-upload-\${host}-\${${GLOBAL_PROCESS}.pid}-\`;`,
      `if (pid === ${GLOBAL_PROCESS}.pid) ${GLOBAL_PROCESS}?.kill(pid, 0);`,
    ].join("\n");

    expect(processReads(bundle)).toEqual([
      { module: "core/lib/utils/fetch-copies.js", api: "process.versions" },
      { module: "core/lib/adapter/multipart/stale-uploads.js", api: "process.pid" },
      { module: "core/lib/adapter/multipart/stale-uploads.js", api: "process.kill" },
    ]);
  });

  it("takes no read of the environment, nor one off globalThis.process, for a Node API", () => {
    const bundle = [
      "// packages/core/lib/logger/json-line.js",
      "const pid = globalThis.process?.pid;",
      `const level = ${GLOBAL_PROCESS}.env.COURIER_LOG_LEVEL ?? ${GLOBAL_PROCESS}?.env?.LOG_LEVEL;`,
    ].join("\n");

    expect(processReads(bundle)).toEqual([]);
  });

  it("reads no comment as a read", () => {
    const bundle = [
      "// packages/core/lib/utils/fetch-copies.js",
      `/* ${GLOBAL_PROCESS}.versions is not read here. */`,
      `// ${GLOBAL_PROCESS}.release neither`,
      "const copies = { forms: false, streams: false };",
    ].join("\n");

    expect(processReads(bundle)).toEqual([]);
  });
});
