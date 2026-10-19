/**
 * A group's schemas are found by names of their own: a name an endpoint's
 * schema refers to by, such as `constructor` or `toString`, finds no schema
 * the specification's record only inherits from `Object.prototype`.
 */
import { describe, expect, it } from "vitest";

import { buildSchemaRecord } from "../../src/apis/generator/build-schema-record";
import type { ParsedGroup, ParsedSpec } from "../../src/apis/parser/types";

function group(refName: string): ParsedGroup {
  return {
    name: "pets",
    description: "",
    prefix: "/pets",
    endpoints: [
      {
        name: "list",
        operationId: "list",
        httpMethod: "get",
        path: "",
        fullPath: "/pets",
        description: "",
        secured: false,
        requestBody: null,
        parameters: [],
        responseSchema: { name: "Pets", type: "ref", refName },
        tags: ["pets"],
      },
    ],
  };
}

const SPEC: ParsedSpec = {
  title: "Shop",
  version: "1",
  description: "",
  baseURL: "https://shop.example",
  format: "openapi3",
  groups: [],
  schemas: { Pet: { name: "Pet", type: "object", properties: {} } },
  securitySchemes: [],
  skipped: [],
};

describe("buildSchemaRecord", () => {
  it("finds a schema a group refers to by its own name", () => {
    expect(Object.keys(buildSchemaRecord(group("Pet"), SPEC, {}))).toEqual(["Pet"]);
  });

  it.each(["constructor", "toString", "hasOwnProperty"])(
    "finds nothing by %s, which the record only inherits",
    (refName) => {
      const record = buildSchemaRecord(group(refName), SPEC, {});

      expect(Object.hasOwn(record, refName)).toBe(false);
    },
  );
});
