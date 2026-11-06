/**
 * Only the server's own code marks a call as a server's — each call of its
 * caller, and an MCP server's for an agent — under keys no other code can
 * name. A context a caller writes cannot pass for a server's call, whatever
 * fields it holds, and a spread of a marked context carries the mark on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentCall } from "../../src/agent/types";
import type { Context } from "../../src/http-client/types";
import {
  agentCallContext,
  agentOf,
  isOneUsersCall,
  serverCallContext,
} from "../../src/utils/one-users-call";

const AGENT: AgentCall = { tool: "orders_cancel", access: "destructive" };

beforeEach(() => {
  /* A server that put a DOM on its global object, where no request is being served. */
  vi.stubGlobal("document", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the marks of a server's call", () => {
  it("are not read off the fields a caller's context holds", () => {
    const written: Context = {};
    Reflect.set(written, "serverCall", true);
    Reflect.set(written, "agent", AGENT);

    expect(isOneUsersCall(written)).toBe(true);
    expect(agentOf(written)).toBeUndefined();
  });

  it("make a call the server's, and go on with a spread of its context", () => {
    const server = { ...serverCallContext({ defaultTimeout: 5_000 }) };
    const agent = {
      ...agentCallContext({ defaultTimeout: 5_000 }, AGENT),
      mode: "direct" as const,
    };

    expect([isOneUsersCall(server), isOneUsersCall(agent)]).toEqual([false, false]);
    expect(agentOf(agent)).toBe(AGENT);
    expect([server.defaultTimeout, agent.defaultTimeout]).toEqual([5_000, 5_000]);
  });

  it("are no field of the context", () => {
    expect(Object.keys(serverCallContext(undefined))).toEqual([]);
    expect(JSON.stringify(agentCallContext({ defaultTimeout: 1 }, AGENT))).toBe(
      '{"defaultTimeout":1}',
    );
  });
});
