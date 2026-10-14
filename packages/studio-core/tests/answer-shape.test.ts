/**
 * An answer's shape, for Studio to follow the contract's drift: each place
 * in the answer as it came back — before the response schema strips what it
 * does not declare — with the JSON types seen there, bounded however large
 * the answer is; read by Studio's runtime from the answer the core hands
 * it, and sent as a `request:shape` event.
 */
import { createKeptBodies, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { answerShapeOf } from "../src/runtime/answer-shape";
import { wireRequestHooks } from "../src/runtime/hooks/request";

afterEach(() => {
  studioHooks.onAnswer = undefined;
});

describe("an answer's shape", () => {
  it("names each place with the types seen there, an array's items merged", () => {
    expect(
      answerShapeOf({ id: "p_1", price: 12, tags: ["a", null], seller: { id: 7, verified: true } }),
    ).toEqual({
      shape: {
        "": "object",
        id: "string",
        price: "number",
        tags: "array",
        "tags[]": "null|string",
        seller: "object",
        "seller.id": "number",
        "seller.verified": "boolean",
      },
      cut: false,
    });
  });

  it("lists the places in the order the walk first reached them", () => {
    const { shape } = answerShapeOf([{ a: { c: 1 } }, { b: 1, a: { d: 1 } }]);

    expect(Object.keys(shape)).toEqual(["", "[]", "[].a", "[].a.c", "[].b", "[].a.d"]);
  });

  it("counts two places a name cannot tell apart as one, with the types of both", () => {
    expect(answerShapeOf({ "": 1, "a.b": "x", a: { b: true } }).shape).toEqual({
      "": "number|object",
      "a.b": "boolean|string",
      a: "object",
    });
  });

  it("reads an array's first items, and stops short of an answer too large or too deep", () => {
    const items = Array.from({ length: 500 }, (_, at) => ({ id: at, [`only${at}`]: true }));
    const deep = JSON.parse(`${"[".repeat(40)}1${"]".repeat(40)}`);

    expect(Object.keys(answerShapeOf(items).shape)).toHaveLength(3 + 20);
    expect(answerShapeOf(deep).cut).toBe(true);
    expect(
      answerShapeOf(Object.fromEntries(Array.from({ length: 2000 }, (_, at) => [`k${at}`, at])))
        .cut,
    ).toBe(true);
  });
});

describe("the shape the runtime sends", () => {
  it("is read from the answer the core hands it, as it came", () => {
    const bus = new EventBus();
    const events: AnyStudioEvent[] = [];
    bus.on((event) => {
      events.push(event);
    });
    wireRequestHooks(bus, "app", (name) => name, createKeptBodies());

    studioHooks.onAnswer?.({ requestId: "req_1", data: { id: "p_1", discount: 5 }, timestamp: 1 });

    expect(events).toEqual([
      expect.objectContaining({
        type: "request:shape",
        requestId: "req_1",
        shape: { "": "object", id: "string", discount: "number" },
        cut: false,
      }),
    ]);
  });
});
