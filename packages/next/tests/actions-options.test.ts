/**
 * Per-call options on a server action caller, through the real request path.
 *
 * `.raw` and `.with({ ... })` compile on `createAction()` as on any caller,
 * and were dropped: `.raw` returned the bare body, so `result.status` read
 * `undefined`, and a per-call header or timeout never reached the request.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAction } from "../src/actions";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { endpoint } = courier();
const sources = {
  api: defineApi({
    baseURL: "https://upstream.example",
    groups: {
      users: defineGroup({
        endpoints: { list: endpoint.get("/users").response<{ id: number }[]>() },
      }),
    },
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function upstream(): { seen: Request[] } {
  const seen: Request[] = [];
  vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
    seen.push(new Request(input, init));
    return Response.json([{ id: 1 }], { status: 200 });
  });
  return { seen };
}

describe("createAction", () => {
  it("answers .raw with the whole response", async () => {
    upstream();
    const action = createAction(sources, "api");

    const result = await action.raw.users.list();

    expect(result.status).toBe(200);
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it("sends the headers given with .with()", async () => {
    const { seen } = upstream();
    const action = createAction(sources, "api");

    await action.with({ headers: { "X-Request-Id": "req-7" } }).users.list();

    expect(seen[0]?.headers.get("x-request-id")).toBe("req-7");
  });
});
