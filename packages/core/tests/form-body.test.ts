/**
 * A form body written as OpenAPI's encoding asks: Stripe and Twilio take
 * every write url-encoded, and sending their fields as JSON failed them all.
 * Each value is written as JSON writes it, so a direct call sends what a call
 * through the proxy does.
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

  it("writes a value as JSON writes it, as a call through the proxy carries it", () => {
    class Money {
      constructor(readonly amount: string) {}
      toJSON() {
        return this.amount;
      }
    }
    const body = formBody(
      {
        price: new Money("1.50"),
        prices: [new Money("2")],
        meta: { at: new Date(0), cost: new Money("3") },
        lost: new Date(Number.NaN),
        ratio: Number.NaN,
        callback: () => "the function's source",
      },
      { meta: { style: "deepObject", explode: true } },
    );

    expect(decoded(body)).toEqual([
      "price=1.50",
      "prices=2",
      "meta[at]=1970-01-01T00:00:00.000Z",
      "meta[cost]=3",
      "lost=",
      "ratio=",
    ]);
  });

  it.each([
    ["form", {}],
    ["form without explode", { list: { explode: false }, held: { explode: false } }],
    ["deepObject", { list: { style: "deepObject" }, held: { style: "deepObject" } }],
  ] as const)(
    "writes in %s style what a call through the proxy does, which carries the fields as JSON gives them back",
    (_, encoding) => {
      const fields = {
        a: 1,
        gone: () => "a function",
        hidden: Symbol("hidden"),
        list: ["x", undefined, "y", () => "a function", Number.NaN],
        holed: Object.assign(new Array<string>(3), { 0: "x", 2: "y" }),
        held: { gone: () => "a function", hidden: Symbol("hidden"), left: undefined, kept: "z" },
      };
      const proxied: Record<string, unknown> = JSON.parse(JSON.stringify(fields));

      expect(decoded(formBody(fields, encoding))).toEqual(decoded(formBody(proxied, encoding)));
    },
  );

  it("leaves out what JSON leaves out of an object, and sends empty what it writes as null in a list", () => {
    const body = formBody({
      a: 1,
      gone: () => "a function",
      hidden: Symbol("hidden"),
      list: ["x", undefined, "y"],
      held: { gone: () => "a function", kept: "z" },
    });

    expect(decoded(body)).toEqual(["a=1", "list=x", "list=", "list=y", "kept=z"]);
  });

  it.each([
    ["a file", new Blob(["x"])],
    ["a Set", new Set(["a"])],
    ["a BigInt", 12n],
  ])("refuses %s, which the body cannot carry, rather than writing it empty", (_, value) => {
    expect(() => formBody({ value })).toThrow(
      expect.objectContaining({ code: "VARIABLE_NOT_ENCODABLE" }),
    );
  });

  it("reads no encoding off the prototype", () => {
    expect(decoded(formBody({ constructor: ["a", "b"] }))).toEqual([
      "constructor=a",
      "constructor=b",
    ]);
  });
});
