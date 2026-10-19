/**
 * The places of a document's objects, by JSON pointer: a key's `~`, `/`
 * and `%` escaped, each object once however many places hold it, and in order.
 */
import { describe, expect, it } from "vitest";

import { placesIn } from "../../../src/apis/parser/document-places";

describe("placesIn", () => {
  it("points at each object wanted, its keys escaped as a JSON pointer writes them", () => {
    const document = {
      paths: { "/pets/{id}": { get: { "x~tag": { mark: true } } } },
      components: { schemas: { Pet: { mark: true }, "Share%": { mark: true } } },
    };

    expect(placesIn(document, (node) => node.mark === true).map((place) => place.pointer)).toEqual([
      "#/components/schemas/Pet",
      "#/components/schemas/Share%25",
      "#/paths/~1pets~1{id}/get/x~0tag",
    ]);
  });

  it("points at an object the document holds in many places, or inside itself, once", () => {
    const shared: Record<string, unknown> = { mark: true };
    shared.self = shared;

    expect(placesIn({ a: shared, b: shared }, (node) => node.mark === true)).toHaveLength(1);
  });

  it("walks a document nested 100 000 deep", () => {
    let deepest: Record<string, unknown> = { mark: true };
    for (let depth = 0; depth < 100_000; depth += 1) deepest = { next: deepest };

    expect(placesIn(deepest, (node) => node.mark === true)).toHaveLength(1);
  });
});
