/**
 * Creating the Express handlers before sources are registered.
 *
 * The factories read the registry as they were created, to announce what
 * they host, and threw SOURCES_NOT_REGISTERED at mount when the routes were
 * wired before `attachRuntime()` or `registerSources()` had run.
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
