/**
 * The port a managed mock gets, how a config edit changes it, and what a
 * definition that cannot be read does to a mock.
 *
 * A port the config declares is held exactly; one Studio assigns comes from
 * `studio.mockBasePort`, stays with the key, and gives way to a port the
 * config declares for another mock. A running mock whose definition breaks
 * keeps serving the one before it; a fixed definition clears the reason a
 * mock could not run.
 */
import { courier, defineApi } from "@noverax/courier/define";
import type { MockServerDescription } from "@noverax/courier-mock/managed";
import { defineMockServer, describeMockServer } from "@noverax/courier-mock/managed";
import { describe, expect, it, vi } from "vitest";

import type { MockLocation } from "../src/server/mock-manager/mock-registration";
import { createMockRegistration } from "../src/server/mock-manager/mock-registration";
import type { ServerState } from "../src/server/mock-manager/types";

function description(overrides: Partial<MockServerDescription> = {}): MockServerDescription {
  return { autoStart: false, routes: [], collections: [], scenarios: [], ...overrides };
}

const here: MockLocation = {
  mocksFile: "/p/courier.mocks.ts",
  relativePath: "courier.mocks.ts:apiMock",
};

function registration(basePort = 7001, reserved: number[] = [], alive: string[] = []) {
  const servers = new Map<string, ServerState>();
  const updateAndEmit = (serverId: string, patch: Partial<ServerState>) => {
    const state = servers.get(serverId);
    if (state) Object.assign(state, patch);
  };
  const ops = createMockRegistration({
    servers,
    basePort,
    reservedPorts: () => reserved,
    isAlive: (serverId) => alive.includes(serverId),
    updateAndEmit,
    emitServerState: vi.fn(),
  });
  return { servers, ops, reserved, alive };
}

describe("the port a managed mock starts on", () => {
  it("is the one the definition declared, held exactly", () => {
    const { servers, ops } = registration();

    ops.registerDeclared("apiMock", here, description({ port: 7401 }));

    expect(servers.get("apiMock")).toMatchObject({ configuredPort: 7401, portDeclared: true });
  });

  it("is allocated from the base when the definition names none", () => {
    const { servers, ops } = registration(7500);

    ops.registerDeclared("apiMock", here, description());

    expect(servers.get("apiMock")).toMatchObject({ configuredPort: 7500, portDeclared: false });
  });

  it("is allocated from the base for a real definition that names none", () => {
    const { endpoint } = courier();
    const api = defineApi({
      baseURL: "https://api.example",
      endpoints: { ping: endpoint.get("ping") },
    });
    const { servers, ops } = registration(7430);

    ops.registerDeclared("apiMock", here, describeMockServer(defineMockServer({ source: api })));

    expect(servers.get("apiMock")?.configuredPort).toBe(7430);
  });

  it("does not hand an allocated port to a second mock that declared one", () => {
    const { servers, ops } = registration(7001);

    ops.registerDeclared("first", here, description());
    ops.registerDeclared("second", here, description({ port: 7401 }));
    ops.registerDeclared("third", here, description());

    expect(servers.get("first")?.configuredPort).toBe(7001);
    expect(servers.get("second")?.configuredPort).toBe(7401);
    expect(servers.get("third")?.configuredPort).toBe(7002);
  });

  it("skips a port a mock not yet registered declares", () => {
    const { servers, ops } = registration(7001, [7001]);

    ops.registerDeclared("orders", here, description());

    expect(servers.get("orders")?.configuredPort).toBe(7002);
  });

  it("skips a port a declaration already took", () => {
    const { servers, ops } = registration(7001);

    ops.registerDeclared("pinned", here, description({ port: 7001 }));
    ops.registerDeclared("allocated", here, description());

    expect(servers.get("allocated")?.configuredPort).not.toBe(7001);
  });
});

describe("a config edit", () => {
  it("moves a mock to the port it now declares", () => {
    const { servers, ops } = registration();
    ops.registerDeclared("apiMock", here, description({ port: 7401 }));

    ops.updateDeclared("apiMock", here, description({ port: 7402 }));

    expect(servers.get("apiMock")?.configuredPort).toBe(7402);
  });

  it("keeps the port Studio assigned", () => {
    const { servers, ops } = registration(7001);
    ops.registerDeclared("other", here, description());
    ops.registerDeclared("apiMock", here, description());
    const assigned = servers.get("apiMock")?.configuredPort;

    ops.updateDeclared("apiMock", here, description());

    expect(servers.get("apiMock")?.configuredPort).toBe(assigned);
  });

  it("gives an assigned port up to another mock that now declares it", () => {
    const { servers, ops, reserved } = registration(7001);
    ops.registerDeclared("users", here, description());
    expect(servers.get("users")?.configuredPort).toBe(7001);

    reserved.push(7001);
    ops.registerDeclared("orders", here, description({ port: 7001 }));
    ops.updateDeclared("users", here, description());

    expect(servers.get("users")?.configuredPort).not.toBe(7001);
    expect(servers.get("orders")?.configuredPort).toBe(7001);
  });

  it("follows the config file to its new name", () => {
    const { servers, ops } = registration();
    ops.registerDeclared("apiMock", here, description());

    const renamed = {
      mocksFile: "/p/courier.mocks.mts",
      relativePath: "courier.mocks.mts:apiMock",
    };
    ops.updateDeclared("apiMock", renamed, description());

    expect(servers.get("apiMock")).toMatchObject(renamed);
  });
});

describe("a definition that cannot be read", () => {
  it("is tracked on a port from the base, not on port 0", () => {
    const { servers, ops } = registration(7600);

    ops.registerProblem("apiMock", here, { broken: true }, "not a definition");

    expect(servers.get("apiMock")).toMatchObject({
      configuredPort: 7600,
      status: "crashed",
      lastError: "not a definition",
    });
  });

  it("keeps the port its raw definition declares", () => {
    const { servers, ops } = registration(7600);

    ops.registerProblem("apiMock", here, { port: 7444 }, "no source");

    expect(servers.get("apiMock")).toMatchObject({ configuredPort: 7444, portDeclared: true });
  });

  it("once fixed, runs on a port from the base and says nothing is wrong", () => {
    const { servers, ops } = registration(7700);
    ops.registerProblem("apiMock", here, { broken: true }, "not a definition");
    const tracked = servers.get("apiMock")?.configuredPort;

    ops.updateDeclared("apiMock", here, description());

    expect(servers.get("apiMock")).toMatchObject({
      configuredPort: tracked,
      status: "declared",
      lastError: undefined,
    });
    expect(tracked).toBeGreaterThanOrEqual(7700);
  });

  it("leaves a running mock running, and says it serves its last working definition", () => {
    const { servers, ops } = registration(7001, [], ["apiMock"]);
    ops.registerDeclared("apiMock", here, description());
    Object.assign(servers.get("apiMock") as ServerState, { status: "running" });

    ops.registerProblem("apiMock", here, { broken: true }, "not a definition.");

    expect(servers.get("apiMock")?.status).toBe("running");
    expect(servers.get("apiMock")?.lastError).toMatch(
      /not a definition\. It keeps serving its last working definition/,
    );
  });
});
