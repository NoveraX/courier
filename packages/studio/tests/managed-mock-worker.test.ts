/**
 * A managed mock server, started the way Studio starts it: the real worker,
 * a TypeScript config with extensionless imports and a top-level await, in a
 * project path with a space, with nothing installed beyond Courier.
 *
 * It serves its routes, lists them as Studio described them, reports a bad
 * declaration or a taken port, and stops at once when asked while its config
 * is still loading.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProcessManager, type ProcessManagerEvents } from "../src/server/mock-manager/process-manager";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A project under the repository's node_modules, so its config resolves the workspace packages. */
function project(mocks: string, { loadDelayMs = 0 } = {}): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "my app "));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "api.ts"),
    'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
      'import { z } from "zod";\n' +
      "const { endpoint } = courier();\n" +
      "const User = z.object({ id: z.number(), name: z.string() });\n" +
      'const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response(z.array(User)) } });\n' +
      'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n',
  );
  writeFileSync(
    join(root, "courier.config.ts"),
    'import { defineMockServer } from "@noverax/courier-mock";\n' +
      'import { api } from "./src/api";\n' +
      `await new Promise((resolve) => setTimeout(resolve, ${loadDelayMs}));\n` +
      `export default { sources: { api }, mocks: ${mocks} };\n`,
  );
  return join(root, "courier.config.ts");
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function manager() {
  const events = {
    onReady: vi.fn(),
    onError: vi.fn(),
    onStopped: vi.fn(),
    onExited: vi.fn(),
    onEvent: vi.fn(),
  } satisfies ProcessManagerEvents;
  const pm = createProcessManager(events);
  cleanups.push(() => pm.dispose());
  return { events, pm };
}

describe("a managed mock server", () => {
  it("starts from a TypeScript config in a path with a space, and serves its routes", async () => {
    const port = await freePort();
    const config = project(`{ apiMock: defineMockServer({ source: api, port: ${port} }) }`);
    const { events, pm } = manager();

    pm.spawn({ serverId: "apiMock", configPath: config, mockKey: "apiMock", port });
    await vi.waitFor(() => expect(events.onReady).toHaveBeenCalled(), { timeout: 15_000 });

    const reply = await fetch(`http://127.0.0.1:${port}/users`);
    expect(reply.status).toBe(200);
    expect(Array.isArray(await reply.json())).toBe(true);
  }, 20_000);

  it("lists its routes with their schema and example while it runs, as Studio described them", async () => {
    const port = await freePort();
    const config = project(`{ apiMock: defineMockServer({ source: api, port: ${port} }) }`);
    const { events, pm } = manager();

    pm.spawn({ serverId: "apiMock", configPath: config, mockKey: "apiMock", port });
    await vi.waitFor(() => expect(events.onReady).toHaveBeenCalled(), { timeout: 15_000 });

    const [route] = events.onReady.mock.calls[0]?.[1].routes ?? [];
    expect(route).toMatchObject({
      fullPath: "/users",
      source: "auto",
      hits: 0,
      avgLatency: 0,
      responseSchema: { id: "number", name: "string" },
    });
    expect(Array.isArray(route?.exampleResponse)).toBe(true);
  }, 20_000);

  it("stops at once when asked while its config is still loading", async () => {
    const port = await freePort();
    const config = project(`{ apiMock: defineMockServer({ source: api, port: ${port} }) }`, { loadDelayMs: 2500 });
    const { events, pm } = manager();

    pm.spawn({ serverId: "apiMock", configPath: config, mockKey: "apiMock", port });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const asked = Date.now();
    await pm.kill("apiMock");

    expect(Date.now() - asked).toBeLessThan(1500);
    expect(events.onReady).not.toHaveBeenCalled();
    expect(events.onExited).not.toHaveBeenCalled();
  }, 20_000);

  it("reports a declaration that is not a mock server", async () => {
    const config = project("{ broken: { autoStart: true } }");
    const { events, pm } = manager();

    pm.spawn({ serverId: "broken", configPath: config, mockKey: "broken", port: await freePort() });

    await vi.waitFor(
      () =>
        expect(events.onError).toHaveBeenCalledWith(
          "broken",
          expect.stringContaining("is not a defineMockServer() definition"),
          true,
        ),
      { timeout: 15_000 },
    );
  }, 20_000);

  it("reports its declared port taken instead of moving to another", async () => {
    const holder = createServer();
    const port = await freePort();
    await new Promise<void>((resolve) => holder.listen(port, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => holder.close(() => resolve())));
    const config = project(`{ apiMock: defineMockServer({ source: api, port: ${port} }) }`);
    const { events, pm } = manager();

    pm.spawn({ serverId: "apiMock", configPath: config, mockKey: "apiMock", port });

    await vi.waitFor(() => expect(events.onError).toHaveBeenCalledWith("apiMock", expect.stringContaining("EADDRINUSE"), true), {
      timeout: 15_000,
    });
    expect(events.onReady).not.toHaveBeenCalled();
  }, 20_000);
});
