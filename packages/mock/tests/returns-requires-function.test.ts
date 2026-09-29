import { describe, expect, it } from "vitest";

import { createMockServer } from "../src/server";

describe("returns()", () => {
  it("refuses static data and points at resolves()", () => {
    const server = createMockServer({ port: 0, log: false });

    expect(() => server.mock("orders", "list").returns([{ id: 1 }] as never)).toThrow(
      /expects a function.*received an array.*resolves\(\)/s,
    );
  });

  it("names what arrived", () => {
    const server = createMockServer({ port: 0, log: false });

    expect(() => server.mock("orders", "one").returns({ id: 1 } as never)).toThrow(
      /received object/,
    );
    expect(() => server.mock("orders", "two").returns(null as never)).toThrow(/received null/);
  });

  it("accepts a handler function", () => {
    const server = createMockServer({ port: 0, log: false });

    expect(() => server.mock("orders", "list").returns(() => [{ id: 1 }])).not.toThrow();
  });
});
