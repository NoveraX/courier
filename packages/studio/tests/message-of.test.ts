import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messageOf } from "../src/server/message-of";

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messageOf", () => {
  it("returns an Error's message as written, line breaks included", () => {
    expect(messageOf(new Error("Failed to load\n  courier.config.ts:3"))).toBe(
      "Failed to load\n  courier.config.ts:3",
    );
  });

  it("converts any other thrown value as String() does", () => {
    expect(messageOf("gone")).toBe("gone");
    expect(messageOf(42)).toBe("42");
    expect(messageOf({ toString: () => "custom" })).toBe("custom");
  });

  it("describes a thrown value that String() cannot convert by its contents", () => {
    const bare = Object.assign(Object.create(null) as object, { code: "E_BARE" });
    const refusing = {
      toString(): string {
        throw new Error("no string form");
      },
    };

    expect(messageOf(bare)).toBe("[Object: null prototype] { code: 'E_BARE' }");
    expect(messageOf(refusing)).toBe("{ toString: [Function: toString] }");
  });
});
