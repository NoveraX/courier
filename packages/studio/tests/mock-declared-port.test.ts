/**
 * `defineMockServer` documents `port` in its own example and `MockServerConfig`
 * types it, but the meta worker read only `autoStart` and `registerDeclared`
 * allocated a port unconditionally. A mock declared on 7401 started on 7001.
 */
import { describe, expect, it, vi } from "vitest";

import { createServerOps } from "../src/server/mock-manager/lifecycle-server-ops";
import type { MetaResult } from "../src/server/mock-manager/meta-pool";
import type { ServerState } from "../src/server/mock-manager/types";

function meta(overrides: Partial<MetaResult> = {}): MetaResult {
  return { autoStart: false, routes: [], collections: [], scenarios: [], ...overrides };
}

function ops(basePort = 7001) {
  const servers = new Map<string, ServerState>();
  const serverOps = createServerOps({
    servers,
    basePort,
    processManager: { has: () => false, spawn: vi.fn(), stop: vi.fn() } as never,
    updateAndEmit: vi.fn(),
    emitServerState: vi.fn(),
  } as never);
  return { servers, serverOps };
}

function declare(key: string, m: MetaResult) {
  return { key, configPath: "/p/courier.config.ts", relativePath: `courier.config.ts:mocks.${key}`, meta: m };
}

describe("the port a managed mock starts on", () => {
  it("is the one the definition declared", () => {
    const { servers, serverOps } = ops();

    serverOps.registerDeclared(declare("apiMock", meta({ port: 7401 })));

    expect(servers.get("apiMock")?.configuredPort).toBe(7401);
  });

  it("is allocated from the base when the definition names none", () => {
    const { servers, serverOps } = ops(7001);

    serverOps.registerDeclared(declare("apiMock", meta()));

    expect(servers.get("apiMock")?.configuredPort).toBe(7001);
  });

  it("counts from the base the project configured", () => {
    const { servers, serverOps } = ops(7500);

    serverOps.registerDeclared(declare("apiMock", meta()));

    expect(servers.get("apiMock")?.configuredPort).toBe(7500);
  });

  it("does not hand an allocated port to a second mock that declared one", () => {
    const { servers, serverOps } = ops(7001);

    serverOps.registerDeclared(declare("first", meta()));
    serverOps.registerDeclared(declare("second", meta({ port: 7401 })));
    serverOps.registerDeclared(declare("third", meta()));

    expect(servers.get("first")?.configuredPort).toBe(7001);
    expect(servers.get("second")?.configuredPort).toBe(7401);
    expect(servers.get("third")?.configuredPort).toBe(7002);
  });

  /** Two mocks must never be handed the same port. */
  it("skips a port a declaration already took", () => {
    const { servers, serverOps } = ops(7001);

    serverOps.registerDeclared(declare("pinned", meta({ port: 7001 })));
    serverOps.registerDeclared(declare("allocated", meta()));

    expect(servers.get("allocated")?.configuredPort).not.toBe(7001);
  });
});
