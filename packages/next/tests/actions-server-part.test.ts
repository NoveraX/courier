/**
 * A Server Action is a server's own entry. Made alone, with nothing else of
 * the server registered in the process, it lends the calls it makes the
 * server's part — the user's session, read from the action's request — and
 * checks the options only a server reads of its sources as it is made.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAction } from "../src/actions";

/* Made up: the session the browser's request carries. */
const SID = ["made", "up", "session"].join("-");

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({
      host: "app.example.com",
      origin: "https://app.example.com",
      cookie: `sid=${SID}`,
    }),
  ),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), getAll: () => [{ name: "sid", value: SID }] }),
}));

const REGISTRY = Symbol.for("courier.serverCapabilities.v1");
const { endpoint } = courier();

const accounts = defineApi({
  name: "accounts",
  baseURL: "https://api.example.com",
  session: { cookies: ["sid"] },
  endpoints: { me: endpoint.get("me") },
});

/* The same API, with a forward that would carry every cookie of the action's request. */
const forwardingCookies = defineApi({
  name: "accounts",
  baseURL: "https://api.example.com",
  session: { cookies: ["sid"] },
  forward: { headers: ["cookie"] },
  endpoints: { me: endpoint.get("me") },
});

beforeEach(() => {
  /* Nothing of the server lent yet, as in an application of Server Actions alone. */
  Reflect.deleteProperty(globalThis, REGISTRY);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a Server Action made alone", () => {
  it("carries the user's session, though nothing else lent the server's part", async () => {
    const sent: Headers[] = [];
    vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
      sent.push(new Request(input, init).headers);
      return Response.json({});
    });

    await createAction({ accounts }, "accounts").me();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.get("cookie")).toBe(`sid=${SID}`);
  });

  it("refuses, as it is made, a forward that would carry the request's cookies", () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    let refused: unknown;
    try {
      createAction({ accounts: forwardingCookies }, "accounts");
    } catch (error) {
      refused = error;
    }

    expect(refused).toMatchObject({ code: "FORWARD_OPTIONS_INVALID" });
    expect(fetched).not.toHaveBeenCalled();
  });
});
