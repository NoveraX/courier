/**
 * A managed mock keeps its records in the project: what a request created is
 * there when its worker starts again — after a restart, and after an edit
 * that changed the mock — unless the mock says `persist: false`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ChildReadyData,
  createProcessManager,
} from "../src/server/mock-manager/process-manager";
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

function workers(root: string) {
  const events = {
    onReady: vi.fn<(serverId: string, data: ChildReadyData) => void>(),
    onError: vi.fn<(serverId: string, message: string, fatal: boolean) => void>(),
    onStopped: vi.fn(),
    onExited: vi.fn<(serverId: string, reason: string) => void>(),
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
  { pm, events }: { pm: ProcessManager; events: ReturnType<typeof workers>["events"] },
  mocksFile: string,
): Promise<number> {
  const before = events.onReady.mock.calls.length;
  /* Port 0: the system picks one as the worker binds, which no other test can take in between. */
  pm.spawn({
    serverId: "apiMock",
    mocksFile,
    mockKey: "apiMock",
    port: 0,
    strictPort: true,
    avoidPorts: [],
  });
  /* Ready, or why not: a start that failed says so at once, not when the wait runs out. */
  const failed = () => [
    ...events.onError.mock.calls.filter(([, , fatal]) => fatal).map(([, message]) => message),
    ...events.onExited.mock.calls.map(([, why]) => why),
  ];
  await vi.waitFor(
    () => expect(events.onReady.mock.calls.length - before + failed().length).toBeGreaterThan(0),
    { timeout: 15_000 },
  );
  expect(failed()).toEqual([]);
  return events.onReady.mock.calls[before]?.[1].port ?? 0;
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
