/**
 * @vitest-environment node
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineMockServer } from "../../src/managed/define-mock-server";
import type { ChildMessage } from "../../src/managed/types";
import type { DrivenWorker } from "./drive-worker";
import { driveWorker, startWorker, stopWorker } from "./drive-worker";

const { endpoint } = courier();

const api = defineApi({
  baseURL: "http://api.test",
  groups: {
    users: defineGroup({
      prefix: "/users",
      endpoints: {
        list: endpoint.get("").response(z.array(z.object({ id: z.number(), name: z.string() }))),
      },
    }),
    pets: defineGroup({
      prefix: "/pets",
      endpoints: {
        list: endpoint.get("").response(z.array(z.object({ id: z.number(), name: z.string() }))),
      },
    }),
  },
});

const mock = defineMockServer({
  source: api,
  log: "silent",
  seed: { count: 6, pets: 3 },
  scenarios: {
    outage: { name: "outage", apply: (m) => m("users", "list").rejects(503) },
  },
});

let worker: DrivenWorker;
let url: string;

beforeEach(async () => {
  worker = driveWorker(mock);
  url = await startWorker(worker);
});

afterEach(async () => {
  await stopWorker(worker);
  vi.restoreAllMocks();
});

async function count(collection: string): Promise<number> {
  const records: unknown[] = await fetch(`${url}/${collection}`).then((res) => res.json());
  return records.length;
}

function scenarioEvents(sent: ChildMessage[]): unknown[] {
  return sent.flatMap((m) =>
    m.type === "event" && m.event.type === "mock:scenario:active" ? [m.event.scenario] : [],
  );
}

describe("mock:server:reset", () => {
  it("empties the store and seeds it again as declared, as /__admin/reset does", async () => {
    await worker.command({ action: "mock:store:delete", collection: "users", id: "*" });

    const result = await worker.command({ action: "mock:server:reset" });

    expect(result.ok).toBe(true);
    expect([await count("users"), await count("pets")]).toEqual([6, 3]);
  });
});

describe("mock:store:seed", () => {
  it("seeds every collection as declared when no count is given", async () => {
    await worker.command({ action: "mock:store:seed", collection: "*", count: 2 });

    await worker.command({ action: "mock:store:seed", collection: "*" });

    expect([await count("users"), await count("pets")]).toEqual([6, 3]);
  });

  it("seeds every collection with a count given for all of them", async () => {
    await worker.command({ action: "mock:store:seed", collection: "*", count: 4 });

    expect([await count("users"), await count("pets")]).toEqual([4, 4]);
  });

  it("seeds only the collection it names", async () => {
    await worker.command({ action: "mock:store:seed", collection: "pets", count: 9 });

    expect([await count("users"), await count("pets")]).toEqual([6, 9]);
  });

  it("refuses a count that is not a whole number, and leaves the store alone", async () => {
    const result = await worker.command({ action: "mock:store:seed", collection: "*", count: "abc" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/count/i);
    expect(await count("users")).toBe(6);
  });

  it("refuses a collection the mock does not serve", async () => {
    const result = await worker.command({ action: "mock:store:seed", collection: "nope", count: 2 });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("nope") });
  });
});

describe("mock:scenario:apply", () => {
  it("refuses a name that is not a scenario of the mock, such as an Object property", async () => {
    const result = await worker.command({ action: "mock:scenario:apply", scenario: "constructor" });

    expect(result).toMatchObject({ ok: false, error: 'Scenario "constructor" not found' });
    expect(scenarioEvents(worker.sent)).toEqual([]);
    expect(await count("users")).toBe(6);
  });

  it("applies a scenario the mock declares", async () => {
    const result = await worker.command({ action: "mock:scenario:apply", scenario: "outage" });

    expect(result.ok).toBe(true);
    expect(scenarioEvents(worker.sent)).toEqual(["outage"]);
    expect((await fetch(`${url}/users`)).status).toBe(503);
  });
});

describe("mock:store:create", () => {
  it("gives a record created in a collection of numeric ids the next number", async () => {
    const ids: unknown[] = await fetch(`${url}/users`)
      .then((res) => res.json())
      .then((users: Array<{ id: unknown }>) => users.map((user) => user.id));

    const result = await worker.command({
      action: "mock:store:create",
      collection: "users",
      record: { name: "Ada" },
    });

    const next = Math.max(...ids.map(Number)) + 1;
    expect(ids.every((id) => typeof id === "number")).toBe(true);
    expect(result.data).toEqual({ name: "Ada", id: next });
    const listed: unknown[] = await fetch(`${url}/users`).then((res) => res.json());
    expect(listed).toContainEqual({ name: "Ada", id: next });
  });
});

describe("mock:store:update and mock:store:delete", () => {
  it("say that a record the collection does not hold is not there", async () => {
    const updated = await worker.command({
      action: "mock:store:update",
      collection: "users",
      id: 999,
      data: { name: "Grace" },
    });
    const deleted = await worker.command({ action: "mock:store:delete", collection: "users", id: 999 });

    expect(updated).toMatchObject({ ok: false, error: "users has no record with id 999" });
    expect(deleted).toMatchObject({ ok: false, error: "users has no record with id 999" });
    expect(await count("users")).toBe(6);
  });

  it("change a record the collection holds", async () => {
    const [first] = await fetch(`${url}/users`).then((res) => res.json());

    const updated = await worker.command({
      action: "mock:store:update",
      collection: "users",
      id: String(first.id),
      data: { name: "Grace" },
    });
    const deleted = await worker.command({ action: "mock:store:delete", collection: "users", id: first.id });

    expect(updated).toMatchObject({ ok: true });
    expect(deleted).toMatchObject({ ok: true });
    expect(await count("users")).toBe(5);
  });
});
