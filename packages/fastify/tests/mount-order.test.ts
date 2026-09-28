/**
 * Registering the Fastify plugin and routes before sources are registered.
 *
 * The plugin and the handler factories read the registry as they were
 * created, to announce what they host, and threw SOURCES_NOT_REGISTERED when
 * the app was wired before `attachRuntime()` or `registerSources()` had run.
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
