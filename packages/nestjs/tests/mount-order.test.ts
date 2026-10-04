/**
 * Creating the NestJS middleware before sources are registered.
 *
 * The middleware reads the registry when it serves a request, not when it
 * is created: read then, it throws SOURCES_NOT_REGISTERED whenever
 * `AppModule.configure` runs before `attachRuntime()` or
 * `registerSources()`.
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
