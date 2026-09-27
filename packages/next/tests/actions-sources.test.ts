/**
 * A server action caller over the sources map `registerSources` takes.
 *
 * `createAction` accepted only grouped APIs, so the map the README tells you
 * to pass — the one handed to `registerSources` — stopped `next build` at
 * "Failed to type check" as soon as it also held a flat `defineApi({
 * endpoints })` source. The typed client it returned was the grouped one
 * too, with no way to call a flat endpoint.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createAction } from "../src/actions";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { endpoint } = courier();
const sources = {
  api: defineApi({
    baseURL: "https://api.example",
    groups: {
      users: defineGroup({
        endpoints: { list: endpoint.get("/users").response<{ id: number }[]>() },
      }),
    },
  }),
  files: defineApi({
    baseURL: "https://files.example",
    endpoints: { stat: endpoint.get("/stat").response<{ size: number }>() },
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function upstream(body: unknown): { seen: string[] } {
  const seen: string[] = [];
  vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
    seen.push(new Request(input, init).url);
    return Response.json(body, { status: 200 });
  });
  return { seen };
}

describe("createAction over a map with grouped and flat sources", () => {
  it("calls a flat source's endpoint", async () => {
    const { seen } = upstream({ size: 3 });

    const files = createAction(sources, "files");
    const stat = await files.stat();

    expectTypeOf(stat).toEqualTypeOf<{ size: number }>();
    expect(stat).toEqual({ size: 3 });
    expect(seen).toEqual(["https://files.example/stat"]);
  });

  it("still calls a grouped source's endpoint from the same map", async () => {
    const { seen } = upstream([{ id: 1 }]);

    const api = createAction(sources, "api");
    const users = await api.users.list();

    expectTypeOf(users).toEqualTypeOf<{ id: number }[]>();
    expect(users).toEqual([{ id: 1 }]);
    expect(seen).toEqual(["https://api.example/users"]);
  });
});
