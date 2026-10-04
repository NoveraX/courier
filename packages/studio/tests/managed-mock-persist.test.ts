/**
 * A managed mock keeps its records in the project: what a request created is
 * there when its worker starts again — after a restart, and after an edit
 * that changed the mock — unless the mock says `persist: false`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProcessManager } from "../src/server/mock-manager/process-manager";
import type { ProcessManager } from "../src/server/mock-manager/types";
import { mockStoreFile } from "../src/server/mock-store-file";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const API =
  'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
  'import { z } from "zod";\n' +
  "const { endpoint } = courier();\n" +
  "const User = z.object({ id: z.number(), name: z.string() });\n" +
  'const users = defineGroup({ prefix: "users", endpoints: {\n' +
  '  list: endpoint.get("").response(z.array(User)),\n' +
  '  create: endpoint.post("").variables(z.object({ name: z.string() })).response(User),\n' +
  "} });\n" +
  'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n';

function mocks(options: string): string {
  return (
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
    'import { api } from "./api";\n' +
    `export default defineMocks({ apiMock: defineMockServer({ source: api, ${options} }) });\n`
  );
}

/** A project under the repository's node_modules, so its files resolve the workspace packages. */
function project(options: string): { root: string; mocksFile: string } {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "mock-persist-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "api.ts"), API);
  writeFileSync(join(root, "courier.mocks.ts"), mocks(options));
  return { root, mocksFile: join(root, "courier.mocks.ts") };
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function workers(root: string) {
  const events = {
    onReady: vi.fn(),
    onError: vi.fn(),
    onStopped: vi.fn(),
    onExited: vi.fn(),
    onEvent: vi.fn(),
  };
  const pm = createProcessManager(events, {
    transformCacheDirectory: () => null,
    storeFile: (mockKey) => mockStoreFile(root, mockKey),
  });
  cleanups.push(() => pm.dispose());
  return { pm, events };
}

async function start(
  { pm, events }: { pm: ProcessManager; events: { onReady: ReturnType<typeof vi.fn> } },
  mocksFile: string,
): Promise<number> {
  const port = await freePort();
  const before = events.onReady.mock.calls.length;
  pm.spawn({ serverId: "apiMock", mocksFile, mockKey: "apiMock", port });
  await vi.waitFor(() => expect(events.onReady.mock.calls.length).toBe(before + 1), {
    timeout: 15_000,
  });
  return port;
}

async function names(port: number): Promise<string[]> {
  const users: Array<{ name: string }> = await fetch(`http://127.0.0.1:${port}/users`).then((r) =>
    r.json(),
  );
  return users.map((user) => user.name);
}

async function create(port: number, name: string): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

describe("a managed mock's records", () => {
  it("are there when its worker starts again", async () => {
    const { root, mocksFile } = project("seed: { count: 2 }");
    const running = workers(root);
    const first = await start(running, mocksFile);
    await create(first, "Ada");
    await running.pm.kill("apiMock");

    const second = await start(running, mocksFile);

    expect(await names(second)).toContain("Ada");
  });

  it("are there after an edit that changed the mock restarted it", async () => {
    const { root, mocksFile } = project("seed: { count: 2 }");
    const running = workers(root);
    const first = await start(running, mocksFile);
    await create(first, "Ada");
    await running.pm.kill("apiMock");
    writeFileSync(mocksFile, mocks("seed: { count: 5 }, autoStart: true"));

    const second = await start(running, mocksFile);

    expect(await names(second)).toContain("Ada");
  });

  it("start from the seeds each time for a mock that says persist: false", async () => {
    const { root, mocksFile } = project("seed: { count: 2 }, persist: false");
    const running = workers(root);
    const first = await start(running, mocksFile);
    await create(first, "Ada");
    await running.pm.kill("apiMock");

    const second = await start(running, mocksFile);

    expect(await names(second)).not.toContain("Ada");
    expect(await names(second)).toHaveLength(2);
  });
});
