/**
 * Every call of a page is one user's, as a page's bundle has it, whichever
 * caller made it: the root's caller, the server's, keeps `cancelPrevious`
 * and the page's session there as the page's own caller does. A bundler
 * that builds for the browser takes the stand-in, which asks nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentCall } from "../../../src/agent/types";
import { isOneUsersCall } from "../../../src/browser/utils/one-users-call";
import { agentCallContext, agentOf } from "../../../src/browser/utils/server-call-marks";
import { courier, defineApi } from "../../../src/define/index";
import { AbortError } from "../../../src/errors";
import { createCaller } from "../../../src/index";

vi.mock(
  "../../../src/capabilities/registry",
  () => import("../../../src/browser/capabilities/registry"),
);
vi.mock(
  "../../../src/utils/one-users-call",
  () => import("../../../src/browser/utils/one-users-call"),
);
vi.mock(
  "../../../src/utils/server-call-marks",
  () => import("../../../src/browser/utils/server-call-marks"),
);

const { endpoint } = courier();
const sent: Headers[] = [];

/** An upstream that answers after a pause, or rejects when its request is cancelled. */
function slowUpstream(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  sent.push(new Headers(init?.headers));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({ ok: true })), 50);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(init.signal?.reason);
    });
  });
}

function api() {
  return defineApi({
    name: "accounts",
    baseURL: "https://api.example.com",
    session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
    endpoints: {
      search: endpoint.get("search").variables<{ q: string }>().cancelPrevious(),
      rename: endpoint.post("me/name").variables<{ name: string }>(),
    },
  });
}

beforeEach(() => {
  Reflect.set(globalThis, "document", { cookie: "csrftoken=t0k3n" });
  vi.stubGlobal("fetch", slowUpstream);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  vi.unstubAllGlobals();
  sent.length = 0;
});

describe("a call in a page", () => {
  it("is one user's, whatever its context says", async () => {
    const { serverCallContext } = await vi.importActual<
      typeof import("../../../src/utils/server-call-marks")
    >("../../../src/utils/server-call-marks");

    expect(isOneUsersCall()).toBe(true);
    expect(isOneUsersCall(serverCallContext(undefined))).toBe(true);
  });

  it("is made for no agent, and marks none", () => {
    const agent: AgentCall = { tool: "orders_cancel", access: "destructive" };

    expect(agentOf(agentCallContext(undefined, agent))).toBeUndefined();
  });

  it("cancels the older read through the root's caller, the server's", async () => {
    const caller = createCaller(api());

    const ended = await Promise.all(
      [caller.search({ q: "a" }), caller.search({ q: "ab" })].map((call) =>
        call.then(
          () => "answered",
          (error: unknown) => (error instanceof AbortError ? error.code : String(error)),
        ),
      ),
    );

    expect(ended).toEqual(["SUPERSEDED", "answered"]);
  });

  it("carries the page's session through the root's caller", async () => {
    await createCaller(api()).rename({ name: "Ada" });

    expect(sent.at(-1)?.get("x-csrftoken")).toBe("t0k3n");
  });
});
