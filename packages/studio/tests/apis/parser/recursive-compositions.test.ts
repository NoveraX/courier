/**
 * A composition found inside itself — a category's `parent` composed of the
 * category and a depth — is declared as a schema of its own, named after
 * where the document writes it, and referred to wherever it is merged:
 * merging it again inside itself ran the parse out of stack. A composition
 * that comes back to itself through a reference read in place is cut there,
 * as before, and one that does not contain itself is merged where it stands.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedSchema } from "../../../src/apis/parser/types";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

function document(schemas: Record<string, unknown>, paths: Record<string, unknown> = {}): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    paths,
    components: { schemas },
  });
}

const CATEGORY = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string" },
    parent: {
      allOf: [
        ref("Category"),
        { type: "object", required: ["depth"], properties: { depth: { type: "integer" } } },
      ],
    },
  },
};

function property(schema: ParsedSchema | undefined, name: string): unknown {
  return schema?.type === "object" ? schema.properties?.[name] : undefined;
}

describe("parseSpec, compositions inside themselves", () => {
  it("declares a property composed of its own schema as a schema of its own", () => {
    const { schemas } = parseSpec(document({ Category: CATEGORY }));

    expect(Object.keys(schemas)).toEqual(["Category", "CategoryParent"]);
    expect(property(schemas.Category, "parent")).toMatchObject({
      type: "ref",
      refName: "CategoryParent",
    });
    expect(property(schemas.CategoryParent, "parent")).toMatchObject({
      type: "ref",
      refName: "CategoryParent",
    });
    expect(schemas.CategoryParent).toMatchObject({
      name: "CategoryParent",
      type: "object",
      required: ["id", "depth"],
    });
  });

  it("declares the items of a list composed of their own schema", () => {
    const node = {
      type: "object",
      properties: {
        children: {
          type: "array",
          items: { allOf: [ref("Node"), { properties: { order: { type: "integer" } } }] },
        },
      },
    };
    const { schemas } = parseSpec(document({ Node: node }));

    expect(Object.keys(schemas)).toEqual(["Node", "NodeChildrenItem"]);
    expect(property(schemas.NodeChildrenItem, "children")).toMatchObject({
      type: "array",
      items: { type: "ref", refName: "NodeChildrenItem" },
    });
  });

  it("declares both halves of compositions that refer to each other, whichever comes first", () => {
    const a = {
      type: "object",
      properties: { b: { allOf: [ref("B"), { properties: { x: {} } }] } },
    };
    const b = {
      type: "object",
      properties: { a: { allOf: [ref("A"), { properties: { y: {} } }] } },
    };
    const aFirst = parseSpec(document({ A: a, B: b })).schemas;
    const bFirst = parseSpec(document({ B: b, A: a })).schemas;

    expect(Object.keys(aFirst).sort()).toEqual(["A", "AB", "B", "BA"]);
    expect(property(aFirst.AB, "a")).toMatchObject({ type: "ref", refName: "BA" });
    expect(property(aFirst.BA, "b")).toMatchObject({ type: "ref", refName: "AB" });
    expect(bFirst.AB).toEqual(aFirst.AB);
    expect(bFirst.BA).toEqual(aFirst.BA);
  });

  it("names a composition inside a component's own composition after the component", () => {
    const category = {
      allOf: [
        ref("Base"),
        { properties: { parent: { allOf: [ref("Category"), { properties: { depth: {} } }] } } },
      ],
    };
    const base = { type: "object", properties: { id: { type: "string" } } };
    const { schemas } = parseSpec(document({ Base: base, Category: category }));

    expect(Object.keys(schemas)).toEqual(["Base", "Category", "CategoryParent"]);
  });

  it("numbers a name another schema or another schema's constant takes", () => {
    const taken = { type: "object", properties: { id: { type: "string" } } };

    expect(
      Object.keys(parseSpec(document({ Category: CATEGORY, CategoryParent: taken })).schemas),
    ).toEqual(["Category", "CategoryParent", "CategoryParent2"]);
    expect(
      Object.keys(parseSpec(document({ Category: CATEGORY, CategoryParentSchema: taken })).schemas),
    ).toEqual(["Category", "CategoryParentSchema", "CategoryParent2"]);
  });

  it("numbers a composition another composition of the same parse named alike", () => {
    const node = {
      type: "object",
      properties: {
        children: { type: "array", items: { allOf: [ref("Node"), { properties: { order: {} } }] } },
      },
    };
    const nodeChildren = {
      type: "object",
      properties: { item: { allOf: [ref("NodeChildren"), { properties: { x: {} } }] } },
    };

    expect(
      Object.keys(parseSpec(document({ Node: node, NodeChildren: nodeChildren })).schemas),
    ).toEqual(["Node", "NodeChildren", "NodeChildrenItem", "NodeChildrenItem2"]);
  });

  it("names a composition met twice inside itself once", () => {
    const yaml = [
      "openapi: 3.0.3",
      "info: { title: Shop, version: '1' }",
      "paths: {}",
      "components:",
      "  schemas:",
      "    Category:",
      "      type: object",
      "      properties:",
      "        parent: &parent",
      "          allOf:",
      "            - $ref: '#/components/schemas/Category'",
      "            - { properties: { depth: { type: integer } } }",
      "        step: *parent",
    ].join("\n");
    const { schemas } = parseSpec(yaml);

    expect(Object.keys(schemas)).toEqual(["Category", "CategoryParent"]);
    expect(property(schemas.CategoryParent, "step")).toMatchObject({
      type: "ref",
      refName: "CategoryParent",
    });
  });

  it("names a composition a path shares with a component after the component", () => {
    const yaml = [
      "openapi: 3.0.3",
      "info: { title: Shop, version: '1' }",
      "paths:",
      "  /categories:",
      "    get:",
      "      responses:",
      "        '200':",
      "          description: ok",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: object",
      "                properties:",
      "                  parent: &parent",
      "                    allOf:",
      "                      - $ref: '#/components/schemas/Category'",
      "                      - { properties: { depth: { type: integer } } }",
      "components:",
      "  schemas:",
      "    Category:",
      "      type: object",
      "      properties:",
      "        parent: *parent",
    ].join("\n");

    expect(Object.keys(parseSpec(yaml).schemas)).toEqual(["Category", "CategoryParent"]);
  });

  it("refers by name from an endpoint to a composition declared already", () => {
    const answer = { allOf: [ref("Category"), { properties: { path: { type: "string" } } }] };
    const paths = {
      "/categories/{id}": {
        get: {
          operationId: "getCategory",
          responses: {
            200: { description: "ok", content: { "application/json": { schema: answer } } },
          },
        },
      },
    };
    const spec = parseSpec(document({ Category: CATEGORY }, paths));
    const response = spec.groups[0]?.endpoints[0]?.responseSchema;

    expect(Object.keys(spec.schemas)).toEqual(["Category", "CategoryParent"]);
    expect(property(response ?? undefined, "parent")).toMatchObject({
      type: "ref",
      refName: "CategoryParent",
    });
  });

  it("keeps a nullable composition inside itself nullable", () => {
    const parent = { ...CATEGORY.properties.parent, nullable: true };
    const category = { ...CATEGORY, properties: { ...CATEGORY.properties, parent } };
    const { schemas } = parseSpec(document({ Category: category }));

    expect(property(schemas.Category, "parent")).toMatchObject({
      type: "ref",
      refName: "CategoryParent",
      nullable: true,
    });
  });

  it("names a Swagger 2.0 definition's composition after it", () => {
    const definition = {
      ...CATEGORY,
      properties: {
        ...CATEGORY.properties,
        parent: { allOf: [{ $ref: "#/definitions/Category" }, { properties: { depth: {} } }] },
      },
    };
    const swagger = { swagger: "2.0", info: { title: "Shop", version: "1" }, paths: {} };
    const { schemas } = parseSpec(
      JSON.stringify({ ...swagger, definitions: { Category: definition } }),
    );

    expect(Object.keys(schemas)).toEqual(["Category", "CategoryParent"]);
  });

  it("refers a component's own composition, met inside itself, to the component", () => {
    const yaml = [
      "openapi: 3.0.3",
      "info: { title: Shop, version: '1' }",
      "paths: {}",
      "components:",
      "  schemas:",
      "    Category: &category",
      "      allOf:",
      "        - { type: object, properties: { id: { type: string } } }",
      "        - { type: object, properties: { parent: *category } }",
    ].join("\n");
    const { schemas } = parseSpec(yaml);

    expect(Object.keys(schemas)).toEqual(["Category"]);
    expect(property(schemas.Category, "parent")).toMatchObject({
      type: "ref",
      refName: "Category",
    });
  });

  it("keeps merged where it stands a composition that does not contain itself", () => {
    const pet = { type: "object", properties: { name: { type: "string" } } };
    const dog = { allOf: [ref("Pet"), { properties: { bark: { type: "boolean" } } }] };
    const { schemas } = parseSpec(document({ Pet: pet, Dog: dog }));

    expect(Object.keys(schemas)).toEqual(["Pet", "Dog"]);
    expect(schemas.Dog).toMatchObject({ type: "object", properties: { name: {}, bark: {} } });
  });

  it("cuts a composition that comes back to itself through a reference read in place, as before", () => {
    const holder = {
      type: "object",
      properties: { h: { allOf: [ref("Category"), { properties: { depth: {} } }] } },
    };
    const category = {
      type: "object",
      properties: { q: { $ref: "#/components/schemas/Holder/properties/h" } },
    };
    const { schemas } = parseSpec(document({ Category: category, Holder: holder }));

    expect(Object.keys(schemas)).toEqual(["Category", "Holder"]);
    /* Holder's h reads Category's q in place, which points back at h: cut there. */
    expect(property(schemas.Holder, "h")).toMatchObject({
      type: "object",
      shape: { properties: { q: { shape: { properties: { q: { type: "any" } } } } } },
    });
  });

  it("starts each parse afresh", () => {
    const text = document({ Category: CATEGORY });

    expect(parseSpec(text)).toEqual(parseSpec(text));
  });
});
