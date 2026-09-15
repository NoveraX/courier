import type { Socket } from "socket.io";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearStudioServerState,
  getRuntimeEntry,
  registerRuntime,
  runtimeRegistry,
  unregisterRuntime,
  updateRuntimeClaim,
} from "../src/server/runtime-namespace-state";

const fakeSocket = { id: "test" } as unknown as Socket;

afterEach(() => {
  clearStudioServerState();
});

describe("runtime-namespace-state", () => {
  it("registers and looks up entries", () => {
    registerRuntime({
      runtimeId: "next-server",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    expect(getRuntimeEntry("next-server")?.kind).toBe("server");
    expect(runtimeRegistry.size).toBe(1);
  });

  it("replaces an existing registration on re-register", () => {
    registerRuntime({
      runtimeId: "x",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    registerRuntime({
      runtimeId: "x",
      kind: "browser",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    expect(getRuntimeEntry("x")?.kind).toBe("browser");
    expect(runtimeRegistry.size).toBe(1);
  });

  it("updates the claim of an existing entry", () => {
    registerRuntime({
      runtimeId: "x",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    const updated = updateRuntimeClaim("x", ["http", "sse"], ["api"]);
    expect(updated?.transports).toEqual(["http", "sse"]);
    expect(getRuntimeEntry("x")?.sourceNames).toEqual(["api"]);
  });

  it("returns undefined when updating an unknown runtime", () => {
    expect(updateRuntimeClaim("missing", ["http"], ["api"])).toBeUndefined();
  });

  it("stores listenOrigin and framework supplied via extras", () => {
    registerRuntime({
      runtimeId: "x",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    const updated = updateRuntimeClaim("x", ["http"], ["api"], {
      listenOrigin: "http://localhost:3000",
      framework: "next",
    });
    expect(updated?.listenOrigin).toBe("http://localhost:3000");
    expect(updated?.framework).toBe("next");
  });

  it("preserves prior listenOrigin/framework when extras are absent", () => {
    registerRuntime({
      runtimeId: "x",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    updateRuntimeClaim("x", ["http"], ["api"], {
      listenOrigin: "http://localhost:3000",
      framework: "next",
    });
    const second = updateRuntimeClaim("x", ["http", "sse"], ["api"]);
    expect(second?.listenOrigin).toBe("http://localhost:3000");
    expect(second?.framework).toBe("next");
  });

  it("unregisters and clears", () => {
    registerRuntime({
      runtimeId: "x",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    expect(unregisterRuntime("x")?.runtimeId).toBe("x");
    expect(getRuntimeEntry("x")).toBeUndefined();
  });

  it("clearStudioServerState empties the registry", () => {
    registerRuntime({
      runtimeId: "a",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    registerRuntime({
      runtimeId: "b",
      kind: "browser",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });
    clearStudioServerState();
    expect(runtimeRegistry.size).toBe(0);
  });
});
