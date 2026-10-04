/**
 * Creating the Express handlers before sources are registered.
 *
 * The handlers read the registry when they serve a request, not when they
 * are created: read at mount, it throws SOURCES_NOT_REGISTERED for routes
 * wired before `attachRuntime()` or `registerSources()` has run.
 */
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { courierHandler, courierSSEHandler, courierWSAttach } from "../src";

describe("the Express handler factories", () => {
  it("create their handlers before any source is registered", () => {
    _resetSourcesForTests();
    const server = createServer();

    expect(() => courierHandler()).not.toThrow();
    expect(() => courierSSEHandler()).not.toThrow();
    expect(() => courierWSAttach(server)).not.toThrow();
  });
});
