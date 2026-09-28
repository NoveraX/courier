/**
 * A form body written as OpenAPI's encoding asks: Stripe and Twilio take
 * every write url-encoded, and sending their fields as JSON failed them all.
 */
import { describe, expect, it } from "vitest";

import { formBody } from "../src/define";

function decoded(body: URLSearchParams): string[] {
  return [...body].map(([name, value]) => `${name}=${value}`);
}

describe("formBody", () => {
  it("writes each field once, a date as its ISO string, null as empty and undefined not at all", () => {
    const body = formBody({
      email: "ada@example.com",
      amount: 2000,
      live: false,
      at: new Date("2026-01-02T03:04:05.000Z"),
      note: null,
      skipped: undefined,
    });

    expect(decoded(body)).toEqual([
      "email=ada@example.com",
      "amount=2000",
      "live=false",
      "at=2026-01-02T03:04:05.000Z",
      "note=",
    ]);
    expect(body.toString()).toContain("email=ada%40example.com");
  });

  it("repeats an array's field by default, and joins it without explode", () => {
    const body = formBody(
      { tag: ["a", "b"], ids: [1, 2], words: ["x", "y"], pipes: ["p", "q"] },
      {
        ids: { style: "form", explode: false },
        words: { style: "spaceDelimited" },
        pipes: { style: "pipeDelimited", explode: false },
      },
    );

    expect(decoded(body)).toEqual(["tag=a", "tag=b", "ids=1,2", "words=x y", "pipes=p|q"]);
  });

  it("writes an object's properties as fields of their own by default, or one value without explode", () => {
    const body = formBody(
      { color: { R: 100, G: 200 }, packed: { R: 1, G: 2 } },
      { packed: { explode: false } },
    );

    expect(decoded(body)).toEqual(["R=100", "G=200", "packed=R,1,G,2"]);
  });

  it("writes a deepObject's properties and items in brackets, at any depth", () => {
    const body = formBody(
      {
        metadata: { plan: "pro", seats: 3 },
        items: [{ price: "p_1", quantity: 2 }, { price: "p_2" }],
        expand: ["customer"],
      },
      {
        metadata: { style: "deepObject", explode: true },
        items: { style: "deepObject", explode: true },
        expand: { style: "deepObject" },
      },
    );

    expect(decoded(body)).toEqual([
      "metadata[plan]=pro",
      "metadata[seats]=3",
      "items[0][price]=p_1",
      "items[0][quantity]=2",
      "items[1][price]=p_2",
      "expand[0]=customer",
    ]);
  });

  it("reads no encoding off the prototype", () => {
    expect(decoded(formBody({ constructor: ["a", "b"] }))).toEqual(["constructor=a", "constructor=b"]);
  });
});
