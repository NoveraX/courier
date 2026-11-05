/**
 * What a replica takes from the control channel: a command of a version and
 * a kind it knows, every field checked and bounded, or why it is set aside —
 * a newer replica's message skipped, anything else refused. Whatever
 * arrives, reading it never throws.
 */
import { describe, expect, it } from "vitest";

import { readClusterMessage } from "../src/adapter/cluster-message";
import { seededRandom } from "./helpers/seeded-random";

const disconnect = {
  v: 1,
  id: "7d0f3f9e-6b8a-4c55-9a51-3c0e4b5f2a10",
  at: 1_700_000_000_000,
  cmd: {
    kind: "disconnect",
    selector: { meta: { userId: "u1" } },
    code: 4001,
    reason: "Signed out",
  },
};

describe("readClusterMessage", () => {
  it("reads a command to close connections, with what it selects", () => {
    expect(readClusterMessage(disconnect)).toEqual({
      message: disconnect,
      selection: { fields: [["userId", "u1"]] },
    });
  });

  it("reads a command to ask for credentials again, with a deadline of its own or none", () => {
    const asked = {
      ...disconnect,
      cmd: { kind: "require-auth", selector: "c1", timeoutMs: 10_000 },
    };
    const unbounded = { ...disconnect, cmd: { kind: "require-auth", selector: { id: ["c1"] } } };

    expect(readClusterMessage(asked)).toMatchObject({ message: asked, selection: { ids: ["c1"] } });
    expect(readClusterMessage(unbounded)).toMatchObject({ message: unbounded });
  });

  it("reads a command to evict connections by their ids, and by nothing else", () => {
    const evict = { ...disconnect, cmd: { kind: "evict", selector: { id: ["c1", "c2"] } } };

    expect(readClusterMessage(evict)).toMatchObject({
      message: evict,
      selection: { ids: ["c1", "c2"] },
    });
    expect(readClusterMessage({ ...evict, cmd: { kind: "evict", selector: "c1" } })).toHaveProperty(
      "malformed",
    );
    expect(
      readClusterMessage({
        ...evict,
        cmd: { kind: "evict", selector: { meta: { userId: "u1" } } },
      }),
    ).toHaveProperty("malformed");
  });

  it("keeps the signature, and nothing it does not act on", () => {
    const signed = { ...disconnect, sig: "ab".repeat(32), relayedBy: "proxy" };

    expect(readClusterMessage(signed)).toEqual({
      message: { ...disconnect, sig: "ab".repeat(32) },
      selection: { fields: [["userId", "u1"]] },
    });
  });

  it("skips a message of a version it does not know, and a command of a kind it does not", () => {
    expect(readClusterMessage({ ...disconnect, v: 2 })).toEqual({ skipped: "version" });
    expect(readClusterMessage({ ...disconnect, cmd: { kind: "drain", selector: "c1" } })).toEqual({
      skipped: "kind",
    });
  });

  const requireAuth = (timeoutMs: unknown) => ({
    ...disconnect,
    cmd: { kind: "require-auth", selector: "c1", timeoutMs },
  });

  it.each([
    ["no object", "disconnect everyone"],
    ["no version", { ...disconnect, v: undefined }],
    ["a version that is no number", { ...disconnect, v: "1" }],
    ["an id that is no string", { ...disconnect, id: 7 }],
    ["an empty id", { ...disconnect, id: "" }],
    ["an id over 64 characters", { ...disconnect, id: "x".repeat(65) }],
    ["a time that is no number", { ...disconnect, at: "now" }],
    ["a time that is not finite", { ...disconnect, at: Number.POSITIVE_INFINITY }],
    ["no command", { ...disconnect, cmd: undefined }],
    ["a command with no kind", { ...disconnect, cmd: { selector: "c1" } }],
    ["a code no socket can send", { ...disconnect, cmd: { ...disconnect.cmd, code: 1006 } }],
    ["a code that is no number", { ...disconnect, cmd: { ...disconnect.cmd, code: "4001" } }],
    [
      "a reason over 123 bytes",
      { ...disconnect, cmd: { ...disconnect.cmd, reason: "é".repeat(62) } },
    ],
    ["a reason that is no string", { ...disconnect, cmd: { ...disconnect.cmd, reason: 7 } }],
    [
      "a selector naming nothing",
      { ...disconnect, cmd: { ...disconnect.cmd, selector: { id: [] } } },
    ],
    ["a negative deadline", requireAuth(-1)],
    ["a fractional deadline", requireAuth(1.5)],
    ["a deadline past what a timer keeps", requireAuth(2 ** 31)],
    ["a deadline that is no number", requireAuth("soon")],
    ["a signature that is no string", { ...disconnect, sig: 7 }],
  ])("refuses a message with %s", (_case, raw) => {
    expect(readClusterMessage(raw)).toHaveProperty("malformed");
  });

  it("never throws, and what it reads reads the same again, whatever arrives", () => {
    const random = seededRandom(0x5eed);
    let read = 0;
    for (let round = 0; round < 3_000; round++) {
      const raw = mutate(structuredClone(disconnect), random);
      const outcome = readClusterMessage(raw);
      if (!("message" in outcome)) continue;
      read++;
      /* As it travels to the next replica: JSON, which keeps -0 as 0. */
      const travelled = JSON.parse(JSON.stringify(outcome)) as typeof outcome;
      expect(readClusterMessage(travelled.message)).toEqual(travelled);
    }
    /* The mutations leave some messages whole, so both branches are taken. */
    expect(read).toBeGreaterThan(0);
    expect(read).toBeLessThan(3_000);
  });
});

/** A message with one of its values, at any depth, replaced, removed or given a field. */
function mutate(message: Record<string, unknown>, random: () => number): unknown {
  const path: Array<Record<string, unknown>> = [message];
  let node: unknown = message;
  while (isObject(node) && random() < 0.6) {
    const keys = Object.keys(node);
    const next = node[keys[Math.floor(random() * keys.length)] ?? ""];
    if (!isObject(next)) break;
    path.push(next);
    node = next;
  }
  const target = path[path.length - 1] ?? message;
  const keys = Object.keys(target);
  const key = keys[Math.floor(random() * keys.length)] ?? "extra";
  const roll = random();
  if (roll < 0.2) delete target[key];
  else if (roll < 0.3) target[`f${Math.floor(random() * 4)}`] = anyValue(random, 2);
  else target[key] = anyValue(random, 2);
  return random() < 0.03 ? anyValue(random, 3) : message;
}

function anyValue(random: () => number, depth: number): unknown {
  const choices: Array<() => unknown> = [
    () => null,
    () => random() < 0.5,
    () => Math.floor(random() * 6_000) - 1_000,
    () => [Number.NaN, Number.POSITIVE_INFINITY, -0, 2 ** 53, 1.5][Math.floor(random() * 5)],
    () => "x".repeat(Math.floor(random() * 200)),
    () => ["c1", "", "disconnect", "require-auth", "__proto__"][Math.floor(random() * 5)],
    () =>
      depth > 0
        ? Array.from({ length: Math.floor(random() * 3) }, () => anyValue(random, depth - 1))
        : [],
    () => (depth > 0 ? { [`k${Math.floor(random() * 3)}`]: anyValue(random, depth - 1) } : {}),
  ];
  return choices[Math.floor(random() * choices.length)]?.();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
