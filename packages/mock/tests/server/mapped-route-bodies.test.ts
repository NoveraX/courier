/**
 * What the mapped REST routes of a mock built from a source read from a
 * request: a body that is not JSON was read as `{}` and the mock answered
 * as though the call had sent nothing, and the name-addressed GET route kept
 * every query value a string where the mapped routes typed numbers.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../../src/auto/create-auto-server";
import type { MockServer } from "../../src/server/create-mock-server";

const { endpoint } = courier();
const User = z.object({ id: z.number(), name: z.string() });

const api = defineApi({
  baseURL: "http://placeholder.invalid",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        list: endpoint.get("").response(z.array(User)),
        create: endpoint.post("").variables<{ name: string }>().response(User),
        update: endpoint.patch(":id").variables<{ id: number; name: string }>().response(User),
      },
    }),
  },
});

let server: MockServer;
let url: string;

beforeAll(async () => {
  server = createAutoMockServer({ source: api, port: 0, log: false, seed: { count: 2 } });
  server.mock("users", "list").returns((ctx) => [{ id: 1, name: JSON.stringify(ctx.variables) }]);
  ({ url } = await server.start());
});

afterAll(async () => {
  await server.stop();
});

function send(method: string, path: string, body: string): Promise<Response> {
  return fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json" }, body });
}

describe("a mapped route given a body that is not JSON", () => {
  it.each([
    ["POST", "/users"],
    ["PATCH", "/users/1"],
  ])("answers 400 to %s %s", async (method, path) => {
    const response = await send(method, path, "{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The request body is not valid JSON" });
  });
});

describe("the name-addressed GET route", () => {
  it("types query values as the mapped routes do", async () => {
    const [user] = await fetch(`${url}/api/users/list?page=2&code=007`).then((r) => r.json());

    expect(JSON.parse(user.name)).toEqual({ page: 2, code: "007" });
  });
});
