/**
 * Creating the NestJS middleware before sources are registered.
 *
 * The factories read the registry as they were created, to announce what
 * they host, and threw SOURCES_NOT_REGISTERED when `AppModule.configure`
 * ran before `attachRuntime()` or `registerSources()` had.
 */
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { courierMiddleware, courierSSEMiddleware, courierWSAttach } from "../src/index";

describe("the NestJS middleware factories", () => {
  it("create their middleware before any source is registered", () => {
    _resetSourcesForTests();
    const server = createServer();

    expect(() => courierMiddleware()).not.toThrow();
    expect(() => courierSSEMiddleware()).not.toThrow();
    expect(() => courierWSAttach(server)).not.toThrow();
  });
});
