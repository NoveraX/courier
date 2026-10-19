/**
 * The name a composition found inside itself is declared by: the component
 * it sits in and the words of the path inside that component, numbered clear
 * of every schema, every schema's constant and every name taken before.
 */
import { describe, expect, it } from "vitest";

import { compositionName } from "../../../src/apis/parser/composition-name";

function inTree(schema: Record<string, unknown>) {
  return { components: { schemas: { Tree: { type: "object", properties: schema } } } };
}

describe("compositionName", () => {
  it("names a composition after its component and the path inside it", () => {
    const members: unknown[] = [];
    const spec = inTree({ kids: { additionalProperties: { allOf: members } } });

    expect(compositionName(spec, members, "kidsValue", new Set())).toEqual({
      name: "TreeKidsValue",
      owned: false,
    });
  });

  it("reads items, variants and the members of an outer composition as words", () => {
    const items: unknown[] = [];
    const variant: unknown[] = [];
    const member: unknown[] = [];
    const spec = inTree({
      list: { type: "array", items: { allOf: items } },
      node: { oneOf: [{ type: "string" }, { allOf: variant }] },
      outer: { allOf: [{ type: "object" }, { properties: { inner: { allOf: member } } }] },
    });

    expect(compositionName(spec, items, "", new Set()).name).toBe("TreeListItem");
    expect(compositionName(spec, variant, "", new Set()).name).toBe("TreeNodeVariant2");
    expect(compositionName(spec, member, "", new Set()).name).toBe("TreeOuterInner");
  });

  it("names a component's own composition after the component", () => {
    const members: unknown[] = [];
    const spec = { components: { schemas: { Category: { allOf: members } } } };

    expect(compositionName(spec, members, "", new Set())).toEqual({
      name: "Category",
      owned: true,
    });
  });

  it("numbers a name another composition took, or a schema or its constant takes", () => {
    const members: unknown[] = [];
    const tree = { kids: { additionalProperties: { allOf: members } } };
    const withTaken = (schemas: Record<string, unknown>) => ({
      components: { schemas: { ...inTree(tree).components.schemas, ...schemas } },
    });

    expect(compositionName(inTree(tree), members, "", new Set(["TreeKidsValue"])).name).toBe(
      "TreeKidsValue2",
    );
    expect(compositionName(withTaken({ TreeKidsValue: {} }), members, "", new Set()).name).toBe(
      "TreeKidsValue2",
    );
    expect(
      compositionName(withTaken({ TreeKidsValueSchema: {} }), members, "", new Set()).name,
    ).toBe("TreeKidsValue2");
  });

  it("numbers a name ending in Schema whose stem a schema takes", () => {
    const members: unknown[] = [];
    const spec = inTree({ schema: { allOf: members } });

    expect(compositionName(spec, members, "", new Set()).name).toBe("TreeSchema2");
  });

  it("falls back to the name it is merged under outside the component schemas", () => {
    const answer: unknown[] = [];
    const spec = {
      paths: { "/tree": { get: { responses: { 200: { schema: { allOf: answer } } } } } },
    };

    expect(compositionName(spec, answer, "getTreeResponse", new Set()).name).toBe(
      "GetTreeResponse",
    );
    expect(compositionName(spec, [], "lost value", new Set()).name).toBe("LostValue");
  });
});
