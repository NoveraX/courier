import { afterEach, describe, expect, it } from "vitest";
import type { MockServer } from "../../src/server/create-mock-server";
import { createMockServer } from "../../src/server/create-mock-server";

let server: MockServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

async function started(): Promise<{ server: MockServer; url: string }> {
  server = createMockServer({ port: 0, log: false });
  const { url } = await server.start();
  return { server, url };
}

function call(url: string, group: string, method: string): Promise<Response> {
  return fetch(`${url}/api/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group, method }),
  });
}

describe("createMockServer scenarioState", () => {
  it("reports the initial state of the applied scenario, as the admin API does", async () => {
    const { server, url } = await started();
    server.applyScenario({ name: "flow", initialState: "s1", apply: () => {} });

    const admin = await fetch(`${url}/__admin/scenarios`).then((res) => res.json());

    expect(admin.state).toBe("s1");
    expect(server.scenarioState).toBe("s1");
  });

  it("reports the state a request moved to, and the state the admin reset set", async () => {
    const { server, url } = await started();
    server.mock("auth", "login").transitionTo("signed-in").resolves({ ok: true });

    await call(url, "auth", "login");
    const afterLogin = server.scenarioState;
    await fetch(`${url}/__admin/scenarios/reset`, { method: "POST" });

    expect([afterLogin, server.scenarioState]).toEqual(["signed-in", "Started"]);
  });
});
