/**
 * What a page loads at start: its entry and what that imports statically,
 * not what a dynamic import loads when a call needs it.
 */
import { describe, expect, it } from "vitest";

import { startClosure } from "./start-closure.mjs";

describe("startClosure", () => {
  it("follows the static imports of the page and leaves out what a dynamic import loads", () => {
    const outputs = {
      "page.js": {
        imports: [
          { path: "chunk-a.js", kind: "import-statement" },
          { path: "lazy.js", kind: "dynamic-import" },
        ],
      },
      "chunk-a.js": { imports: [{ path: "chunk-b.js", kind: "import-statement" }] },
      "chunk-b.js": { imports: [] },
      "lazy.js": { imports: [{ path: "chunk-c.js", kind: "import-statement" }] },
      "chunk-c.js": { imports: [] },
    };

    expect([...startClosure(outputs, "page.js")]).toEqual(["page.js", "chunk-a.js", "chunk-b.js"]);
  });
});
