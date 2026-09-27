/**
 * A source defined with no endpoints yet, as a project starts out.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/index";

describe("a source with no endpoints", () => {
  it("makes a caller when it is flat", () => {
    const source = defineApi({ baseURL: "https://api.example.com", endpoints: {} });

    const client = createCaller(source);

    expect(client.with({ timeout: 1_000 })).toBeTypeOf("object");
    expectTypeOf(client).not.toHaveProperty("anything");
  });

  it("makes a caller when it has no groups", () => {
    const source = defineApi({ baseURL: "https://api.example.com", groups: {} });

    const client = createCaller(source);

    expect(client.with({ timeout: 1_000 })).toBeTypeOf("object");
  });
});
