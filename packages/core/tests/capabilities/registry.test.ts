/**
 * The registry a server lends its capabilities through: what the server
 * provides is found by the calls of its process, the first implementation
 * of a slot stays, and a page or an app finds nothing whatever lies on its
 * global object.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InProcessProxyCapability } from "../../src/capabilities/in-process-proxy";
import {
  _resetServerCapabilitiesForTests,
  provideServerCapability,
  serverCapability,
} from "../../src/capabilities/registry";

const REGISTRY = Symbol.for("courier.serverCapabilities.v1");

function capability(): InProcessProxyCapability {
  return { route: () => undefined };
}

afterEach(() => {
  _resetServerCapabilitiesForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* The debug lines the server's log prints. */
function debugLines(): string[][] {
  vi.stubEnv("COURIER_LOG_LEVEL", "debug");
  const lines: string[][] = [];
  vi.spyOn(console, "debug").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String));
  });
  return lines;
}

describe("serverCapability", () => {
  it("answers undefined for a capability nothing provided", () => {
    expect(serverCapability("inProcessProxy")).toBeUndefined();
  });

  it("answers the implementation the server provided", () => {
    const provided = capability();
    provideServerCapability("inProcessProxy", provided);

    expect(serverCapability("inProcessProxy")).toBe(provided);
  });

  it("finds a slot another copy of the core filled under the same contract", () => {
    const provided = capability();
    Reflect.set(globalThis, REGISTRY, { inProcessProxy: provided });

    expect(serverCapability("inProcessProxy")).toBe(provided);
  });

  it("reads no registry of another contract's version", () => {
    const other = Symbol.for("courier.serverCapabilities.v2");
    Reflect.set(globalThis, other, { inProcessProxy: capability() });
    try {
      expect(serverCapability("inProcessProxy")).toBeUndefined();
    } finally {
      Reflect.deleteProperty(globalThis, other);
    }
  });

  it("answers undefined in a page, whatever its global object holds", () => {
    provideServerCapability("inProcessProxy", capability());
    vi.stubGlobal("document", {});

    expect(serverCapability("inProcessProxy")).toBeUndefined();
  });

  it("answers undefined in a React Native app", () => {
    provideServerCapability("inProcessProxy", capability());
    vi.stubGlobal("navigator", { product: "ReactNative" });

    expect(serverCapability("inProcessProxy")).toBeUndefined();
  });
});

describe("provideServerCapability", () => {
  it("keeps the first implementation when another one is provided, and says so once", () => {
    const printed = debugLines();
    const first = capability();
    provideServerCapability("inProcessProxy", first);
    provideServerCapability("inProcessProxy", capability());

    expect(serverCapability("inProcessProxy")).toBe(first);
    expect(printed).toHaveLength(1);
    expect(printed[0]?.join(" ")).toContain("inProcessProxy was provided already");
  });

  it("changes nothing, and says nothing, when the same implementation is provided again", () => {
    const printed = debugLines();
    const provided = capability();
    provideServerCapability("inProcessProxy", provided);
    provideServerCapability("inProcessProxy", provided);

    expect(serverCapability("inProcessProxy")).toBe(provided);
    expect(printed).toEqual([]);
  });
});
