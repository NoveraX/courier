/**
 * The registry a server lends its capabilities through: what the server
 * provides is found by the calls of its process — a server that put a DOM
 * on its global object among them — and a React Native app finds nothing.
 * A page's bundle takes a stand-in that reads no slot at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InProcessProxyCapability } from "../../src/capabilities/in-process-proxy";
import {
  _resetServerCapabilitiesForTests,
  provideServerCapability,
} from "../../src/capabilities/provide-server-capability";
import { serverCapability } from "../../src/capabilities/registry";

const REGISTRY = Symbol.for("courier.serverCapabilities.v1");

function capability(): InProcessProxyCapability {
  return { route: () => undefined };
}

afterEach(() => {
  _resetServerCapabilitiesForTests("inProcessProxy");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it("answers what was provided on a server that put a DOM on its global object", () => {
    const provided = capability();
    provideServerCapability("inProcessProxy", provided);
    vi.stubGlobal("document", { cookie: "" });

    expect(serverCapability("inProcessProxy")).toBe(provided);
  });

  it("answers undefined in a React Native app", () => {
    provideServerCapability("inProcessProxy", capability());
    vi.stubGlobal("navigator", { product: "ReactNative" });

    expect(serverCapability("inProcessProxy")).toBeUndefined();
  });
});
