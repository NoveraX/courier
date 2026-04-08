/**
 * Tests for the unified socket-resolution helpers in
 * `resolve-target-socket.ts`. These primitives back both the HTTP playground
 * router (`ui-playground-handler.ts`) and the smart stream/replay router
 * (`playground-stream-routing.ts`), so a regression here fans out to both
 * paths at once.
 *
 * Coverage:
 *  - `listAppSockets` — snapshot semantics
 *  - `findSocketBySession` — happy path + miss
 *  - `findSocketHostingEndpoint` — snapshot ordering AND the race
 *    where the catalog mutates mid-iteration. The race regression test
 *    swaps a stub `getRuntimeLayer` between calls and verifies the helper
 *    used the value sampled at function entry, not the post-mutation one.
 */

import { describe, expect, it } from "vitest";

import type { SourceMap } from "@noverax/nexus-studio-core";
import type { CatalogStore } from "../src/server/catalog";
import {
  findSocketBySession,
  findSocketHostingEndpoint,
  listAppSockets,
  pickExecutionSocket,
} from "../src/server/resolve-target-socket";
import type { AppNamespace, AppSocket, AppSocketData } from "../src/server/socket-data";

function makeStubSocket(data: AppSocketData): AppSocket {
  return { data } as unknown as AppSocket;
}

function makeStubNamespace(sockets: AppSocket[]): AppNamespace {
  const map = new Map<string, AppSocket>();
  sockets.forEach((s, i) => map.set(`s${i}`, s));
  return { sockets: map } as unknown as AppNamespace;
}

const layerWithSSE: SourceMap = {
  api: {
    baseURL: "http://api",
    groups: {
      n: {
        prefix: "/n",
        endpoints: {
          feed: {
            type: "query",
            hasVariablesSchema: false,
            hasResponseSchema: false,
            transport: "sse",
          },
        },
      },
    },
  },
} as unknown as SourceMap;

const layerWithWS: SourceMap = {
  api: {
    baseURL: "http://api",
    groups: {
      c: {
        prefix: "/c",
        endpoints: {
          room: {
            type: "query",
            hasVariablesSchema: false,
            hasResponseSchema: false,
            transport: "ws",
          },
        },
      },
    },
  },
} as unknown as SourceMap;

describe("listAppSockets", () => {
  it("returns a snapshot array of the namespace's sockets", () => {
    const a = makeStubSocket({});
    const b = makeStubSocket({});
    const ns = makeStubNamespace([a, b]);
    expect(listAppSockets(ns)).toEqual([a, b]);
  });

  it("returns an empty array when no sockets are connected", () => {
    expect(listAppSockets(makeStubNamespace([]))).toEqual([]);
  });
});

describe("findSocketBySession", () => {
  it("returns the matching socket", () => {
    const a = makeStubSocket({ sessionId: "a" });
    const b = makeStubSocket({ sessionId: "b" });
    expect(findSocketBySession([a, b], "b")).toBe(b);
  });

  it("returns undefined when no socket matches", () => {
    const a = makeStubSocket({ sessionId: "a" });
    expect(findSocketBySession([a], "missing")).toBeUndefined();
  });
});

describe("pickExecutionSocket", () => {
  it("returns undefined when no sockets are connected", () => {
    expect(pickExecutionSocket([], { preferServer: true })).toBeUndefined();
  });

  it("preferServer=true picks the server-framework socket regardless of order", () => {
    const browser = makeStubSocket({ sessionId: "b", framework: "unknown" });
    const server = makeStubSocket({ sessionId: "s", framework: "next" });
    expect(pickExecutionSocket([browser, server], { preferServer: true })).toBe(server);
    expect(pickExecutionSocket([server, browser], { preferServer: true })).toBe(server);
  });

  it("preferServer=true falls back to the first socket when no server framework is connected", () => {
    const a = makeStubSocket({ sessionId: "a", framework: "unknown" });
    const b = makeStubSocket({ sessionId: "b", framework: "unknown" });
    expect(pickExecutionSocket([a, b], { preferServer: true })).toBe(a);
  });

  it("preferServer=false picks the LAST socket (newest browser tab after HMR)", () => {
    const old = makeStubSocket({ sessionId: "old", framework: "unknown" });
    const fresh = makeStubSocket({ sessionId: "fresh", framework: "unknown" });
    expect(pickExecutionSocket([old, fresh], { preferServer: false })).toBe(fresh);
  });

  it("sessionId override wins regardless of preferServer", () => {
    const server = makeStubSocket({ sessionId: "s", framework: "next" });
    const browser = makeStubSocket({ sessionId: "b", framework: "unknown" });
    expect(
      pickExecutionSocket([server, browser], { sessionId: "b", preferServer: true }),
    ).toBe(browser);
  });

  it("stale sessionId falls through to mode-based selection", () => {
    const server = makeStubSocket({ sessionId: "s", framework: "next" });
    const browser = makeStubSocket({ sessionId: "b", framework: "unknown" });
    expect(
      pickExecutionSocket([server, browser], { sessionId: "missing", preferServer: true }),
    ).toBe(server);
  });
});

describe("findSocketHostingEndpoint", () => {
  it("returns the first socket whose runtime layer hosts the endpoint", () => {
    const a = makeStubSocket({ sessionId: "a" });
    const b = makeStubSocket({ sessionId: "b" });
    const cat = {
      getRuntimeLayer: (id: string) => (id === "b" ? layerWithSSE : layerWithWS),
    } as unknown as CatalogStore;

    const result = findSocketHostingEndpoint([a, b], cat, {
      source: "api",
      group: "n",
      method: "feed",
      transport: "sse",
    });
    expect(result).toBe(b);
  });

  it("skips sockets without a sessionId", () => {
    const noSession = makeStubSocket({});
    const withSession = makeStubSocket({ sessionId: "ok" });
    const cat = {
      getRuntimeLayer: (id: string) => (id === "ok" ? layerWithSSE : undefined),
    } as unknown as CatalogStore;

    const result = findSocketHostingEndpoint([noSession, withSession], cat, {
      source: "api",
      group: "n",
      method: "feed",
      transport: "sse",
    });
    expect(result).toBe(withSession);
  });

  it("returns undefined when no socket hosts the endpoint", () => {
    const a = makeStubSocket({ sessionId: "a" });
    const cat = {
      getRuntimeLayer: () => layerWithWS,
    } as unknown as CatalogStore;

    const result = findSocketHostingEndpoint([a], cat, {
      source: "api",
      group: "n",
      method: "feed",
      transport: "sse",
    });
    expect(result).toBeUndefined();
  });

  it("snapshots layers upfront — mid-iteration mutation cannot change the decision", () => {
    // Simulates a `connection:sources` HMR event landing while we're walking
    // sockets. The catalog stub flips its layer the FIRST time it is asked
    // (snapshot phase) vs later. With the snapshot fix, the helper records
    // both layers BEFORE searching, so even if a later read would have
    // produced a different verdict the result remains consistent with the
    // initial sample.
    const a = makeStubSocket({ sessionId: "a" });
    const b = makeStubSocket({ sessionId: "b" });

    let aReads = 0;
    let bReads = 0;
    const cat = {
      getRuntimeLayer: (id: string) => {
        if (id === "a") {
          aReads += 1;
          return layerWithWS; // never matches SSE
        }
        if (id === "b") {
          bReads += 1;
          return layerWithSSE; // matches SSE
        }
        return undefined;
      },
    } as unknown as CatalogStore;

    const result = findSocketHostingEndpoint([a, b], cat, {
      source: "api",
      group: "n",
      method: "feed",
      transport: "sse",
    });

    // Only one read per socket — no second pass that could see a mutated
    // catalog state.
    expect(aReads).toBe(1);
    expect(bReads).toBe(1);
    expect(result).toBe(b);
  });
});
