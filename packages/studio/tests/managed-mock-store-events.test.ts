/**
 * A managed mock server keeps Studio's view of its store current: a request
 * that writes to the store is followed by a report of what it changed — the
 * record a POST created, not the collection it joined — so the Mocks
 * dashboard counts it, and a read sends nothing more than its own lifecycle.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProcessManager,
  type ProcessManagerEvents,
} from "../src/server/mock-manager/process-manager";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A project under the repository's node_modules, so its files resolve the workspace packages. */
function project(): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "store-events-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "api.ts"),
    'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
      'import { z } from "zod";\n' +
      "const { endpoint } = courier();\n" +
      "const User = z.object({ id: z.number(), name: z.string() });\n" +
      'const users = defineGroup({ prefix: "users", endpoints: {\n' +
      '  list: endpoint.get("").response(z.array(User)),\n' +
      '  create: endpoint.post("").variables(z.object({ name: z.string() })).response(User),\n' +
      "} });\n" +
      'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n',
  );
  writeFileSync(
    join(root, "courier.mocks.ts"),
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
      'import { api } from "./api";\n' +
      "export default defineMocks({ apiMock: defineMockServer({ source: api, seed: { count: 3 } }) });\n",
  );
  return join(root, "courier.mocks.ts");
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function startMock(): Promise<{
  port: number;
  events: ProcessManagerEvents & { onEvent: ReturnType<typeof vi.fn> };
}> {
  const events = {
    onReady: vi.fn(),
    onError: vi.fn(),
    onStopped: vi.fn(),
    onExited: vi.fn(),
    onEvent: vi.fn(),
  };
  const pm = createProcessManager(events, {
    transformCacheDirectory: () => null,
    storeFile: () => null,
  });
  cleanups.push(() => pm.dispose());
  const port = await freePort();
  pm.spawn({ serverId: "apiMock", mocksFile: project(), mockKey: "apiMock", port });
  await vi.waitFor(() => expect(events.onReady).toHaveBeenCalled(), { timeout: 15_000 });
  return { port, events };
}

interface UsersReport {
  name: string;
  count: number;
  records?: unknown[];
  edits?: { added: unknown[] };
}

function usersReports(onEvent: ReturnType<typeof vi.fn>): UsersReport[] {
  return onEvent.mock.calls
    .map(([, event]) => event as { type?: string; collections?: UsersReport[] })
    .filter((event) => event.type === "mock:store:changes")
    .flatMap(
      (event) => event.collections?.filter((collection) => collection.name === "users") ?? [],
    );
}

describe("a managed mock server's store, as Studio sees it", () => {
  it("is followed by the record a request writes to it", async () => {
    const { port, events } = await startMock();

    const created = await fetch(`http://127.0.0.1:${port}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    });
    expect(created.ok).toBe(true);

    await vi.waitFor(() => expect(usersReports(events.onEvent)).toHaveLength(1), {
      timeout: 5_000,
    });
    expect(usersReports(events.onEvent)).toEqual([
      {
        name: "users",
        count: 4,
        edits: { removed: [], changed: [], added: [expect.objectContaining({ name: "Ada" })] },
      },
    ]);
  }, 20_000);

  it("is not sent after a request that only reads it", async () => {
    const { port, events } = await startMock();

    await fetch(`http://127.0.0.1:${port}/users`);
    await vi.waitFor(() =>
      expect(events.onEvent).toHaveBeenCalledWith(
        "apiMock",
        expect.objectContaining({ type: "mock:request:end" }),
      ),
    );

    expect(usersReports(events.onEvent)).toEqual([]);
  }, 20_000);
});
