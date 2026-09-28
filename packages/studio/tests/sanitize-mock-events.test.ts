import { describe, expect, it } from "vitest";
import {
  sanitizeMockCommand,
  sanitizeMockManaged,
} from "../src/server/sanitize-mock-events";

describe("sanitizeMockCommand", () => {
  it("accepts a fully-valid store create command", () => {
    const cmd = {
      action: "mock:store:create",
      serverId: "srv1",
      collection: "users",
      record: { id: 1, name: "Alice" },
    };
    expect(sanitizeMockCommand(cmd)).toEqual(cmd);
  });

  it("preserves per-action sub-fields (network set)", () => {
    const cmd = {
      action: "mock:network:set",
      serverId: "srv1",
      config: { latency: 100, errorRate: 0.05 },
      preset: "slow",
    };
    expect(sanitizeMockCommand(cmd)).toEqual(cmd);
  });

  it("rejects missing action / serverId", () => {
    expect(sanitizeMockCommand({ serverId: "x" })).toBeUndefined();
    expect(sanitizeMockCommand({ action: "x" })).toBeUndefined();
    expect(sanitizeMockCommand({ action: "", serverId: "x" })).toBeUndefined();
    expect(sanitizeMockCommand({ action: "x", serverId: "" })).toBeUndefined();
    expect(sanitizeMockCommand({ action: 42, serverId: "x" })).toBeUndefined();
  });

  it("rejects non-object input", () => {
    expect(sanitizeMockCommand(null)).toBeUndefined();
    expect(sanitizeMockCommand("str")).toBeUndefined();
    expect(sanitizeMockCommand([])).toBeUndefined();
    expect(sanitizeMockCommand(undefined)).toBeUndefined();
  });

  it("strips __proto__ / constructor / prototype keys (proto pollution)", () => {
    // JSON.parse creates an OWN property `__proto__` (literal `{__proto__:...}`
    // would set the prototype instead — which our isPlainObject guard already
    // rejects). This mirrors the real wire-format attack vector.
    const cmd = JSON.parse(
      '{"action":"mock:store:create","serverId":"s1","__proto__":{"polluted":true},"constructor":"evil","prototype":"evil","legitimate":"kept"}',
    );
    const out = sanitizeMockCommand(cmd);
    expect(out?.legitimate).toBe("kept");
    expect(Object.hasOwn(out ?? {}, "__proto__")).toBe(false);
    expect(Object.hasOwn(out ?? {}, "constructor")).toBe(false);
    expect(Object.hasOwn(out ?? {}, "prototype")).toBe(false);
    // biome-ignore lint/suspicious/noExplicitAny: prototype-pollution check
    expect(({} as any).polluted).toBeUndefined();
  });

  it("rejects objects with tampered prototype chain", () => {
    const tampered = Object.create({ malicious: true });
    tampered.action = "mock:store:create";
    tampered.serverId = "s1";
    expect(sanitizeMockCommand(tampered)).toBeUndefined();
  });
});

describe("sanitizeMockManaged", () => {
  it("accepts command with serverId", () => {
    expect(sanitizeMockManaged({ command: "mock:managed:start", serverId: "s1" })).toEqual({
      command: "mock:managed:start",
      serverId: "s1",
    });
  });

  it("accepts command without serverId (startAll)", () => {
    expect(sanitizeMockManaged({ command: "mock:managed:startAll" })).toEqual({
      command: "mock:managed:startAll",
    });
  });

  it("preserves extra fields", () => {
    const out = sanitizeMockManaged({
      command: "mock:managed:start",
      serverId: "s1",
      extra: { foo: "bar" },
    });
    expect(out?.extra).toEqual({ foo: "bar" });
  });

  it("rejects missing command", () => {
    expect(sanitizeMockManaged({ serverId: "s1" })).toBeUndefined();
    expect(sanitizeMockManaged({ command: "" })).toBeUndefined();
    expect(sanitizeMockManaged({ command: 42 })).toBeUndefined();
  });

  it("drops invalid serverId silently while keeping command", () => {
    const out = sanitizeMockManaged({ command: "mock:managed:start", serverId: 123 });
    expect(out).toEqual({ command: "mock:managed:start" });
  });

  it("strips proto-pollution keys", () => {
    const out = sanitizeMockManaged(
      JSON.parse('{"command":"mock:managed:start","__proto__":{"polluted":true}}'),
    );
    expect(Object.hasOwn(out ?? {}, "__proto__")).toBe(false);
  });
});
