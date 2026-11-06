/**
 * Which published modules only a server runs: everything in a server's
 * folder, and a server's module named on its own — not one whose path
 * merely begins the same way.
 */
import { describe, expect, it } from "vitest";

import { serverAreaOf } from "./server-area.mjs";

const AREAS = ["adapter/", "transport/in-process/", "node.js"];

describe("serverAreaOf", () => {
  it("finds a module of a server's folder, however deep", () => {
    expect(serverAreaOf("adapter/multipart/read-form.js", AREAS)).toBe("adapter/");
    expect(serverAreaOf("transport/in-process/sse.js", AREAS)).toBe("transport/in-process/");
  });

  it("finds a server's module named on its own, and only that one", () => {
    expect(serverAreaOf("node.js", AREAS)).toBe("node.js");
    expect(serverAreaOf("node-request.js", AREAS)).toBeUndefined();
  });

  it("leaves a page's modules alone, the transports beside the server's among them", () => {
    expect(serverAreaOf("transport/direct/http.js", AREAS)).toBeUndefined();
    expect(serverAreaOf("adapters.js", AREAS)).toBeUndefined();
  });
});
