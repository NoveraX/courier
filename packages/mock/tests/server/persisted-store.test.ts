/**
 * A mock server that keeps its store in a file: the records its requests
 * create are there after a restart; a collection the file has nothing for
 * keeps its seeds, and one the source no longer serves is not brought back;
 * a reset saves the reseeded store; and a server without the option keeps
 * nothing.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../../src/auto/create-auto-server";
import { createMockServer } from "../../src/server";
import { readStoreFile } from "../../src/store/store-file";

const { endpoint } = courier();
const Todo = z.object({ id: z.number(), title: z.string() });
const Note = z.object({ id: z.number(), text: z.string() });

const dirs: string[] = [];
const running: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function storeFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-persisted-store-"));
  dirs.push(dir);
  return join(dir, "mocks", "shop.json");
}

function api(groups: { todos?: boolean; notes?: boolean }) {
  return defineApi({
    baseURL: "https://api.example",
    groups: {
      ...(groups.todos && {
        todos: defineGroup({
          prefix: "/todos",
          endpoints: {
            list: endpoint.get("").response(z.array(Todo)),
            get: endpoint.get(":id").response(Todo),
            create: endpoint.post("").response(Todo),
          },
        }),
      }),
      ...(groups.notes && {
        notes: defineGroup({
          prefix: "/notes",
          endpoints: { list: endpoint.get("").response(z.array(Note)) },
        }),
      }),
    },
  });
}

async function serve(source: ReturnType<typeof api>, file: string) {
  const server = createAutoMockServer({
    source,
    port: 0,
    log: false,
    seed: { count: 2 },
    persist: { file },
  });
  const { url } = await server.start();
  return { server, url };
}

const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("a mock server that keeps its store in a file", () => {
  it("has the records its requests created after a restart", async () => {
    const file = storeFile();
    const first = await serve(api({ todos: true }), file);
    const created = await fetch(`${first.url}/todos`, post({ title: "Kept" })).then((r) =>
      r.json(),
    );
    await first.server.stop();

    const second = await serve(api({ todos: true }), file);
    running.push(second.server);
    const read = await fetch(`${second.url}/todos/${created.id}`).then((r) => r.json());

    expect(read).toEqual({ id: created.id, title: "Kept" });
  });

  it("seeds a collection the file has nothing for, and drops one the source no longer serves", async () => {
    const file = storeFile();
    const first = await serve(api({ todos: true }), file);
    await fetch(`${first.url}/todos`, post({ title: "Kept" }));
    await first.server.stop();

    const second = await serve(api({ notes: true }), file);
    running.push(second.server);

    expect(second.server.store.list()).toEqual(["notes"]);
    expect(second.server.store.collection("notes").count()).toBe(2);
  });

  it("saves the reseeded store after a reset", async () => {
    const file = storeFile();
    const { server, url } = await serve(api({ todos: true }), file);
    running.push(server);
    await fetch(`${url}/todos`, post({ title: "Gone after the reset" }));

    server.resetStore();
    await server.saveStore();

    expect(readStoreFile(file)?.todos).toHaveLength(2);
  });

  it("built without a source, restores every collection the file holds", async () => {
    const file = storeFile();
    const first = createMockServer({ port: 0, log: false, persist: { file } });
    first.store.collection("anything").create({ id: 1 });
    await first.start();
    await first.stop();

    const second = createMockServer({ port: 0, log: false, persist: { file } });
    running.push(second);
    await second.start();

    expect(second.store.collection("anything").getAll()).toEqual([{ id: 1 }]);
  });
});

describe("a mock server without the option", () => {
  it("keeps nothing in a file", async () => {
    const file = storeFile();
    const server = createAutoMockServer({ source: api({ todos: true }), port: 0, log: false });
    running.push(server);
    const { url } = await server.start();

    await fetch(`${url}/todos`, post({ title: "Not kept" }));
    await server.saveStore();

    expect(existsSync(file)).toBe(false);
  });
});
