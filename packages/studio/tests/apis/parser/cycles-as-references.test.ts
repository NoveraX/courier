/**
 * An object a YAML document holds inside itself is written, where it comes
 * back, as a reference to it: reading such a schema followed it down until
 * the stack ran out. An object several places share stays shared.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import { cyclesAsReferences } from "../../../src/apis/parser/cycles-as-references";

describe("cyclesAsReferences", () => {
  it("writes an object inside itself as a reference to where the document writes it", () => {
    const tree: Record<string, unknown> = { type: "object" };
    tree.properties = { child: tree };
    const document = { components: { schemas: { Tree: tree } } };

    cyclesAsReferences(document);

    expect(tree.properties).toEqual({ child: { $ref: "#/components/schemas/Tree" } });
  });

  it("writes a cycle through several objects where it comes back, its keys escaped", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b", list: [a] };
    a.next = b;
    const document = { paths: { "/a~b": a } };

    cyclesAsReferences(document);

    expect(b.list).toEqual([{ $ref: "#/paths/~1a~0b" }]);
    expect(a.next).toBe(b);
  });

  it("keeps an object several places share, none of them inside it, shared", () => {
    const shared = { type: "string" };
    const document = { one: { value: shared }, two: { value: shared } };

    cyclesAsReferences(document);

    expect(document.one.value).toBe(shared);
    expect(document.two.value).toBe(shared);
  });

  it("walks a document 100 000 deep, coming back at the bottom", () => {
    const top: Record<string, unknown> = {};
    let deepest = top;
    for (let depth = 0; depth < 100_000; depth += 1) {
      const next: Record<string, unknown> = {};
      deepest.next = next;
      deepest = next;
    }
    deepest.back = top;

    cyclesAsReferences({ top });

    expect(deepest.back).toEqual({ $ref: "#/top" });
  });
});

describe("parseSpec, a YAML schema inside itself", () => {
  const yaml = (tree: string[]) =>
    [
      "openapi: 3.0.3",
      "info: { title: Trees, version: '1' }",
      "paths: {}",
      "components:",
      "  schemas:",
      ...tree,
    ].join("\n");

  it("reads a schema whose property is itself as one referring to itself", () => {
    const { schemas } = parseSpec(
      yaml(["    Tree: &tree", "      type: object", "      properties:", "        child: *tree"]),
    );

    expect(schemas.Tree).toMatchObject({
      type: "object",
      properties: { child: { type: "ref", refName: "Tree" } },
    });
  });

  it("reads a composition whose member holds it the same way", () => {
    const { schemas } = parseSpec(
      yaml([
        "    Base: { type: object, properties: { id: { type: string } } }",
        "    Tree: &tree",
        "      allOf:",
        "        - $ref: '#/components/schemas/Base'",
        "        - { type: object, properties: { child: *tree } }",
      ]),
    );

    expect(schemas.Tree).toMatchObject({
      type: "object",
      properties: { id: { type: "string" }, child: { type: "ref", refName: "Tree" } },
    });
  });
});
