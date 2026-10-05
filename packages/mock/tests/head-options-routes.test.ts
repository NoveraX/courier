/**
 * @vitest-environment node
 *
 * HEAD and OPTIONS endpoints a source declares, answered by the endpoint
 * that declares them. Hono answers every HEAD with the GET route at its
 * path, and CORS answered every OPTIONS itself: a `.head()` without a GET
 * beside it was not found, one beside a GET was answered by the GET, and an
 * `.options()` endpoint was never reached. A browser's preflight is still
 * answered by CORS, which lets QUERY through.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();
const User = z.object({ id: z.number(), name: z.string() });

const server = createAutoMockServer({
  source: defineApi({
    baseURL: "http://api.test",
    groups: {
      users: defineGroup({
        prefix: "/users",
        endpoints: {
          list: endpoint.get("").response(z.array(User)),
          get: endpoint.get(":id").response(User),
          exists: endpoint.head(":id"),
          check: endpoint.head("check"),
          allowed: endpoint.options("").response(z.object({ verbs: z.array(z.string()) })),
        },
      }),
    },
  }),
  port: 0,
  log: false,
  seed: { count: 3 },
  overrides: (mock) => {
    mock("users", "allowed").resolves({ verbs: ["GET", "QUERY"] });
  },
});

let url: string;
beforeAll(async () => {
  url = (await server.start()).url;
});
afterAll(async () => {
  await server.stop();
});

/* The endpoint the mock answered the last request with. */
const answeredBy = (): string | undefined => server.history.at(-1)?.method;

describe("a HEAD endpoint", () => {
  it("is answered at a path no GET declares", async () => {
    const response = await fetch(`${url}/users/check`, { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(answeredBy()).toBe("check");
  });

  it("answers a HEAD at a GET's path, and leaves the GET to its own endpoint", async () => {
    await fetch(`${url}/users/2`, { method: "HEAD" });
    expect(answeredBy()).toBe("exists");

    const response = await fetch(`${url}/users/2`);
    expect(((await response.json()) as z.infer<typeof User>).id).toBe(2);
    expect(answeredBy()).toBe("get");
  });
});

describe("an OPTIONS endpoint", () => {
  it("is answered when the request is not a browser's preflight", async () => {
    const response = await fetch(`${url}/users`, {
      method: "OPTIONS",
      headers: { origin: "http://app.test" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verbs: ["GET", "QUERY"] });
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("leaves a preflight to CORS, which allows QUERY", async () => {
    const response = await fetch(`${url}/users`, {
      method: "OPTIONS",
      headers: { origin: "http://app.test", "access-control-request-method": "QUERY" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("QUERY");
  });
});
