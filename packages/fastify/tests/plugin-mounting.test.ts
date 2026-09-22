/**
 * `prefix` is Fastify's own encapsulation option: it already scopes every
 * route a plugin registers. Applying it a second time put the proxy at
 * `/api/request/api/request/*`, so the documented registration answered 404
 * to every request — which no test saw, because none of them registered the
 * plugin the way the documentation does and then asked it for anything.
 */
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";

import { courierPlugin } from "../src/index";

const { endpoint } = courier();

const api = defineApi({
  name: "api",
  baseURL: "http://127.0.0.1:1",
  endpoints: { list: endpoint.get("items").response<unknown>() },
});

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

async function mounted(options: Record<string, unknown>) {
  registerSources({ api });
  const app = Fastify();
  await app.register(courierPlugin as never, options as never);
  await app.ready();
  servers.push(app);
  return app;
}

describe("where the plugin mounts", () => {
  it("puts the proxy at the prefix, not under a repeat of it", async () => {
    const app = await mounted({ prefix: "/api/request" });

    expect(app.printRoutes()).not.toContain("api/request/api/request");
  });

  it("answers at the documented path", async () => {
    const app = await mounted({ prefix: "/api/request" });

    const res = await app.inject({
      method: "POST",
      url: "/api/request",
      payload: { source: "api", method: "list", variables: {} },
    });

    expect(res.statusCode).not.toBe(404);
  });

  it("answers below the prefix as well", async () => {
    const app = await mounted({ prefix: "/api/request" });

    const res = await app.inject({ method: "POST", url: "/api/request/anything" });

    expect(res.statusCode).not.toBe(404);
  });

  it("mounts at the root when no prefix is given", async () => {
    const app = await mounted({});

    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { source: "api", method: "list", variables: {} },
    });

    expect(res.statusCode).not.toBe(404);
  });

  it("leaves an unrelated path alone", async () => {
    const app = await mounted({ prefix: "/api/request" });

    const res = await app.inject({ method: "POST", url: "/somewhere-else" });

    expect(res.statusCode).toBe(404);
  });
});
