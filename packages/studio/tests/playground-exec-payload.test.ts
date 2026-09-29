/**
 * The Playground's `playground:exec` payload, as Studio reads it before
 * forwarding it to a runtime. A key that reaches `Object.prototype` was
 * refused only on the payload's top level, so one nested a level down went
 * through; header values were passed on whatever their type.
 */
import { describe, expect, it } from "vitest";

import { hasDangerousKeys } from "../src/server/has-dangerous-keys";
import { sanitizeExec } from "../src/server/runtime-playground-router-sanitize";

function exec(fields: Record<string, unknown>): unknown {
  return { rid: "r1", source: "api", group: "users", method: "get", transport: "http", ...fields };
}

describe("hasDangerousKeys", () => {
  it.each([
    ['{"__proto__":{}}'],
    ['{"user":{"__proto__":{"admin":true}}}'],
    ['{"list":[{"ok":1},{"constructor":{"prototype":{}}}]}'],
    ['[[{"prototype":1}]]'],
  ])("finds the key at any depth: %s", (json) => {
    expect(hasDangerousKeys(JSON.parse(json))).toBe(true);
  });

  it("passes a payload without them, however deep", () => {
    let deep: unknown = { leaf: "x" };
    for (let depth = 0; depth < 20_000; depth++) deep = { next: deep };

    expect(hasDangerousKeys(deep)).toBe(false);
  });
});

describe("sanitizeExec", () => {
  it("refuses variables with a prototype key below the top level", () => {
    const variables = JSON.parse('{"filter":{"__proto__":{"polluted":true}}}');

    expect(sanitizeExec(exec({ variables }))).toBeNull();
  });

  it("refuses headers whose values are not strings", () => {
    expect(sanitizeExec(exec({ headers: { "x-count": 3 } }))).toBeNull();
    expect(sanitizeExec(exec({ headers: ["authorization"] }))).toBeNull();
  });

  it("passes string headers on, and leaves them out when none were sent", () => {
    expect(sanitizeExec(exec({ headers: { "x-trace": "abc" } }))?.headers).toEqual({
      "x-trace": "abc",
    });
    expect(sanitizeExec(exec({}))).not.toHaveProperty("headers");
  });
});
