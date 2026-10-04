/**
 * `prefix` is Fastify's own encapsulation option: it already scopes every
 * route a plugin registers, so the plugin does not apply it a second time —
 * which would put the proxy at `/api/request/api/request/*` and answer 404
 * to the documented registration. The tests register the plugin the way
 * the documentation does and then ask it for something. With no prefix, the
 * plugin takes only the path a caller looks at by default, never `/` and
 * `/*`: every path the app does not route itself keeps its own 404.
 */

import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

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
      url: "/api/request?_s=api&_m=list",
      payload: { variables: {} },
    });

    expect(res.statusCode).not.toBe(404);
  });

  it("leaves paths below the prefix to the app", async () => {
    const app = await mounted({ prefix: "/api/request" });

    const res = await app.inject({ method: "POST", url: "/api/request/anything" });

    expect(res.statusCode).toBe(404);
  });

  it("answers where the caller looks by default when no prefix is given", async () => {
    const app = await mounted({});

    const res = await app.inject({
      method: "POST",
      url: "/api/request?_s=api&_m=list",
      payload: { variables: {} },
    });

    expect(res.statusCode).not.toBe(404);
  });

  it("leaves the app's own 404s alone when no prefix is given", async () => {
    const app = await mounted({});

    const home = await app.inject({ method: "GET", url: "/" });
    const missing = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(home.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
  });

  it("leaves an unrelated path alone", async () => {
    const app = await mounted({ prefix: "/api/request" });

    const res = await app.inject({ method: "POST", url: "/somewhere-else" });

    expect(res.statusCode).toBe(404);
  });
});
