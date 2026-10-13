/**
 * What the Playground shows of an endpoint's `.defaults()`: each defaulted
 * field of the schema with its default and no longer required, a field of
 * its own for a default no schema describes, the variables it starts with
 * holding the defaults, and a check that does not ask for a defaulted field.
 */
import { describe, expect, it } from "vitest";

import { fieldsWithDefaults } from "@/features/playground/defaulted-fields";
import { variablesCheckOf } from "@/features/playground/input-check";
import { variablesStubOf } from "@/features/playground/variables-stub";
import type { CatalogEndpoint } from "@/store/types-ui";

const SCHEMA_FIELDS = [
  { path: "group", type: "string", required: true },
  { path: "groupBy", type: '"year" | "month"', required: true },
];

function endpoint(extra: Partial<CatalogEndpoint>): CatalogEndpoint {
  return {
    type: "query",
    hasVariablesSchema: true,
    hasResponseSchema: false,
    path: "news",
    httpMethod: "GET",
    origin: "scan",
    ...extra,
  };
}

describe("fieldsWithDefaults", () => {
  it("gives a defaulted field its default and makes it optional", () => {
    expect(fieldsWithDefaults(SCHEMA_FIELDS, { groupBy: "year" })).toEqual([
      { path: "group", type: "string", required: true },
      { path: "groupBy", type: '"year" | "month"', required: false, default: "year" },
    ]);
  });

  it("adds a field for each default no schema describes", () => {
    expect(fieldsWithDefaults(undefined, { limit: 5, tags: ["press"] })).toEqual([
      { path: "limit", type: "number", required: false, default: 5 },
      { path: "tags", type: "array", required: false, default: ["press"] },
    ]);
  });

  it("leaves the fields as they are without defaults", () => {
    expect(fieldsWithDefaults(SCHEMA_FIELDS, undefined)).toEqual(SCHEMA_FIELDS);
    expect(fieldsWithDefaults(undefined, undefined)).toBeUndefined();
  });
});

describe("the Playground's variables", () => {
  it("start with the defaults set", () => {
    const def = endpoint({
      variablesStub: { group: "", groupBy: "" },
      variablesDefaults: { groupBy: "year" },
    });

    expect(JSON.parse(variablesStubOf(def, 2))).toEqual({ group: "", groupBy: "year" });
  });

  it("start with the defaults of variables declared by type alone, beside the path's parameters", () => {
    const def = endpoint({
      hasVariablesSchema: false,
      path: "groups/:id/news",
      variablesDefaults: { limit: 5 },
    });

    expect(JSON.parse(variablesStubOf(def, 2))).toEqual({ id: "", limit: 5 });
  });

  it("need no defaulted field to pass the check", () => {
    const fields = fieldsWithDefaults(SCHEMA_FIELDS, { groupBy: "year" });

    expect(variablesCheckOf('{ "group": "press" }', fields, "news").tone).toBe("ok");
    expect(variablesCheckOf("{}", fields, "news")).toMatchObject({
      tone: "warn",
      label: 'Missing required field "group"',
    });
  });
});
