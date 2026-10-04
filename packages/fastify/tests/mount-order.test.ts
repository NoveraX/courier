/**
 * Registering the Fastify plugin and routes before sources are registered.
 *
 * The plugin and the handlers read the registry when they serve a request,
 * not when they are created: read at registration, it throws
 * SOURCES_NOT_REGISTERED for an app wired before `attachRuntime()` or
 * `registerSources()` has run.
 */
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { courierPlugin, courierSSEHandler, courierWSHandler } from "../src";

describe("the Fastify plugin and handler factories", () => {
  it("register before any source is registered", async () => {
    _resetSourcesForTests();
    const app = Fastify();
    app.register(courierPlugin);

    await expect(app.ready()).resolves.toBeDefined();
    expect(() => courierSSEHandler()).not.toThrow();
    expect(() => courierWSHandler()).not.toThrow();
    await app.close();
  });
});
