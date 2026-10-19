/**
 * A local JSON pointer is followed segment by segment, its `~1`, `~0` and
 * percent escapes decoded. A segment whose percent escape decodes to no text
 * names no key: it resolves to nothing, as a pointer the document does not
 * define does, rather than failing the whole read — and never to a key its
 * raw text might spell. A segment names a list's item by its index, as a
 * bundler writes a shared item and a YAML alias of a list's item becomes:
 * followed only into objects, such a reference resolved to nothing, and
 * the parse noted a reference the document does hold as missing.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import { componentSchemaName, resolveRef } from "../../../src/apis/parser/ref-utils";

const SPEC = {
  components: {
    schemas: {
      "Pet Store": { type: "object" },
      Zz: { type: "string" },
      Both: {
        allOf: [
          { type: "object", title: "first" },
          { type: "object", title: "second" },
        ],
      },
    },
  },
  paths: { "/pets": { get: { operationId: "listPets" } } },
};

describe("resolveRef", () => {
  it.each(["%zz", "%E0%A4%A", "%C3%28"])(
    "resolves nothing for a segment escaped as %s",
    (segment) => {
      expect(resolveRef(SPEC, `#/components/schemas/${segment}`)).toEqual({});
    },
  );

  it("follows a segment into a list by the item's index", () => {
    expect(resolveRef(SPEC, "#/components/schemas/Both/allOf/1")).toEqual({
      type: "object",
      title: "second",
    });
  });

  it.each(["5", "01", "-", "1.0", "-1"])("resolves nothing for a list's item named %s", (index) => {
    expect(resolveRef(SPEC, `#/components/schemas/Both/allOf/${index}`)).toEqual({});
  });

  it("still decodes a well-formed escape", () => {
    expect(resolveRef(SPEC, "#/components/schemas/Pet%20Store")).toEqual({ type: "object" });
    expect(resolveRef(SPEC, "#/paths/~1pets/get")).toEqual({ operationId: "listPets" });
  });
});

describe("componentSchemaName", () => {
  it("names no component for a name whose escape is malformed", () => {
    expect(componentSchemaName("#/components/schemas/%zz")).toBeUndefined();
    expect(componentSchemaName("#/definitions/%C3%28")).toBeUndefined();
  });

  it("names a component by its escaped name decoded", () => {
    expect(componentSchemaName("#/components/schemas/Pet%20Store")).toBe("Pet Store");
    expect(componentSchemaName("#/definitions/Pet~1Store")).toBe("Pet/Store");
  });
});

describe("parseSpec, a reference into a list", () => {
  it("reads a parameter and an answer a reference names by a list's item", () => {
    const ok = (schema: unknown) => ({
      200: { description: "ok", content: { "application/json": { schema } } },
    });
    const { groups, skipped } = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Shop", version: "1" },
        paths: {
          "/a": {
            get: {
              operationId: "getA",
              parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }],
              responses: { 204: { description: "none" } },
            },
          },
          "/b": {
            get: {
              operationId: "getB",
              parameters: [{ $ref: "#/paths/~1a/get/parameters/0" }],
              responses: ok({ $ref: "#/components/schemas/Both/allOf/0" }),
            },
          },
        },
        components: {
          schemas: {
            Both: {
              allOf: [
                { type: "object", properties: { id: { type: "string" } } },
                { type: "object", properties: { n: { type: "number" } } },
              ],
            },
          },
        },
      }),
    );
    const getB = groups.flatMap((group) => group.endpoints).find((ep) => ep.name === "getB");

    expect(getB?.parameters?.map((param) => param.name)).toEqual(["limit"]);
    expect(getB?.responseSchema).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(skipped).toEqual([]);
  });

  it("reads a YAML alias of a list's item, inside itself, as a reference to it", () => {
    const { schemas, skipped } = parseSpec(
      [
        "openapi: 3.0.3",
        "info: { title: Trees, version: '1' }",
        "paths: {}",
        "components:",
        "  schemas:",
        "    Tree:",
        "      oneOf:",
        "        - &node",
        "          type: object",
        "          properties:",
        "            label: { type: string }",
        "            child: *node",
        "        - { type: string }",
      ].join("\n"),
    );

    const [node] = schemas.Tree?.type === "union" ? (schemas.Tree.variants ?? []) : [];

    expect(node?.properties?.child).toMatchObject({
      type: "object",
      shape: { properties: { label: { type: "string" } } },
    });
    expect(skipped).toEqual([]);
  });
});
