/**
 * The metadata a registry selects connections by: a snapshot of what
 * `onConnect` gave, taken as the connection is let in and renewed by
 * `updateMeta`, so a change to the object afterwards is not seen; `get()`
 * and `list()` hand out copies of it; and a selector finds its
 * connections through an index of each field's values — a value compared
 * with its type, as `===` compares it — the same ones a pass over every
 * connection would find.
 */
import { describe, expect, it, vi } from "vitest";

import { createConnectionRegistry } from "../src/adapter/ws-registry";
import type { ConnectionSelector, RegistryEntry } from "../src/adapter/ws-registry-types";
import { createServerTopicManager } from "../src/adapter/ws-topics";
import { seededRandom } from "./helpers/seeded-random";

function entry(connectionId: string, meta: Record<string, unknown>): RegistryEntry {
  return {
    connectionId,
    meta,
    connectedAt: 0,
    sendRaw: vi.fn(),
    sendEncoded: vi.fn(),
    sendTopicEvent: vi.fn(),
    close: vi.fn(),
    requireAuth: vi.fn(() => () => undefined),
    evict: vi.fn(),
  };
}

function registryOf(...entries: RegistryEntry[]) {
  const registry = createConnectionRegistry();
  registry.setTopicManager(createServerTopicManager());
  for (const added of entries) registry.add(added);
  return registry;
}

const ids = (registry: ReturnType<typeof registryOf>, selector: ConnectionSelector) =>
  registry
    .list(selector)
    .map((info) => info.connectionId)
    .sort();

describe("the metadata a registry selects connections by", () => {
  it("is a snapshot taken as the connection is let in", () => {
    const meta = { userId: "u1", role: "admin" };
    const registry = registryOf(entry("c1", meta));

    meta.role = "guest";

    expect(ids(registry, { meta: { role: "admin" } })).toEqual(["c1"]);
    expect(ids(registry, { meta: { role: "guest" } })).toEqual([]);
    expect(registry.get("c1")?.meta).toEqual({ userId: "u1", role: "admin" });
  });

  it("is handed out by get() and list() as copies, which change nothing it holds", () => {
    const registry = registryOf(entry("c1", { role: "admin" }));

    (registry.get("c1")?.meta as Record<string, unknown>).role = "guest";
    for (const info of registry.list()) (info.meta as Record<string, unknown>).role = "guest";

    expect(ids(registry, { meta: { role: "admin" } })).toEqual(["c1"]);
    expect(registry.get("c1")?.meta).toEqual({ role: "admin" });
  });

  it("is renewed by updateMeta, the connection found by its new fields only", () => {
    const registry = registryOf(entry("c1", { userId: "u1", plan: "free" }));

    registry.updateMeta("c1", { userId: "u1", plan: "pro" });

    expect(ids(registry, { meta: { plan: "free" } })).toEqual([]);
    expect(ids(registry, { meta: { plan: "pro", userId: "u1" } })).toEqual(["c1"]);
  });

  it("compares each value with its type: 1, '1' and true are three, 0 and -0 one", () => {
    const registry = registryOf(
      entry("number", { v: 1 }),
      entry("string", { v: "1" }),
      entry("boolean", { v: true }),
      entry("zero", { v: -0 }),
    );

    expect(ids(registry, { meta: { v: 1 } })).toEqual(["number"]);
    expect(ids(registry, { meta: { v: "1" } })).toEqual(["string"]);
    expect(ids(registry, { meta: { v: true } })).toEqual(["boolean"]);
    expect(ids(registry, { meta: { v: 0 } })).toEqual(["zero"]);
  });

  it("compares a connection's own fields only, never what every object inherits", () => {
    const registry = registryOf(
      entry("c1", Object.create({ role: "admin" }) as Record<string, unknown>),
      entry("c2", JSON.parse('{"__proto__":"x","userId":"u2"}') as Record<string, unknown>),
    );

    expect(ids(registry, { meta: { role: "admin" } })).toEqual([]);
    expect(ids(registry, { meta: { constructor: "Object" } })).toEqual([]);
    expect(ids(registry, JSON.parse('{"meta":{"__proto__":"x"}}'))).toEqual(["c2"]);
  });

  it("lets a connection go from every field once it is removed", () => {
    const registry = registryOf(entry("c1", { userId: "u1" }), entry("c2", { userId: "u1" }));

    registry.remove("c1");

    expect(ids(registry, { meta: { userId: "u1" } })).toEqual(["c2"]);
    registry.remove("c2");
    expect(ids(registry, { meta: { userId: "u1" } })).toEqual([]);
  });

  it("finds what a pass over every connection finds, for random metadata and selectors", () => {
    const random = seededRandom(0x13);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)] as T;
    const values = [0, 1, "0", "1", "a", true, false, null, { nested: 1 }] as const;
    const fields = ["userId", "role", "team", "flag"];
    const metaOf = () =>
      Object.fromEntries(fields.filter(() => random() < 0.7).map((field) => [field, pick(values)]));
    const registry = registryOf();
    const held = new Map<string, Record<string, unknown>>();

    for (let step = 0; step < 2_000; step++) {
      const id = `c${Math.floor(random() * 200)}`;
      const action = random();
      if (action < 0.5 && !held.has(id)) {
        held.set(id, metaOf());
        registry.add(entry(id, { ...held.get(id) }));
      } else if (action < 0.7 && held.has(id)) {
        held.set(id, metaOf());
        registry.updateMeta(id, { ...held.get(id) });
      } else if (action < 0.8) {
        held.delete(id);
        registry.remove(id);
      } else {
        const asked = Object.fromEntries(
          fields
            .filter(() => random() < 0.5)
            .map((field) => [field, pick(values.filter((v) => typeof v !== "object"))]),
        ) as Record<string, string | number | boolean>;
        if (Object.keys(asked).length === 0) continue;
        const expected = [...held]
          .filter(([, meta]) =>
            Object.entries(asked).every(([f, v]) => Object.hasOwn(meta, f) && meta[f] === v),
          )
          .map(([connectionId]) => connectionId)
          .sort();
        expect(ids(registry, { meta: asked })).toEqual(expected);
      }
    }
  });
});
