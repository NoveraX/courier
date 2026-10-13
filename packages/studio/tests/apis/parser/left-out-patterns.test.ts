/**
 * A pattern longer than Studio compiles is left out of the schema it
 * constrains, so the generated validator takes any text for that field:
 * the parse says so among what it left out, naming where the document
 * writes the pattern — for the import wizard and the CLI to show.
 */
import { describe, expect, it } from "vitest";

import { leaveOutPattern } from "../../../src/apis/parser/left-out-patterns";
import { MAX_PATTERN_LENGTH } from "../../../src/apis/parser/max-pattern-length";
import { parseSpec } from "../../../src/apis/parser/parse-spec";

const LONG = `^(${Array.from({ length: 2_000 }, (_, n) => `Zone/${n}`).join("|")})$`;
const SHORT = "^[a-z]+$";

function openapi(pattern: string): string {
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Zones", version: "1" },
    paths: {
      "/zones/{id}": {
        get: {
          operationId: "getZone",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", pattern } },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
    components: {
      schemas: {
        Zone: { type: "object", properties: { name: { type: "string", pattern } } },
      },
    },
  });
}

describe("a pattern longer than Studio compiles", () => {
  it("is listed as left out, by the JSON pointer of each schema that writes it", () => {
    expect(LONG.length).toBeGreaterThan(MAX_PATTERN_LENGTH);

    const spec = parseSpec(openapi(LONG));

    expect(spec.skipped).toEqual([
      {
        method: "PATTERN",
        path: "#/components/schemas/Zone/properties/name",
        reason: `its pattern is ${LONG.length} characters long, more than the ${MAX_PATTERN_LENGTH} Studio compiles, so values are not checked against it`,
      },
      expect.objectContaining({
        method: "PATTERN",
        path: "#/paths/~1zones~1{id}/get/parameters/0/schema",
      }),
    ]);
  });

  it("is named where a Swagger 2.0 document writes it", () => {
    const text = JSON.stringify({
      swagger: "2.0",
      info: { title: "Zones", version: "1" },
      paths: {},
      definitions: {
        Zone: { type: "object", properties: { name: { type: "string", pattern: LONG } } },
      },
    });

    expect(parseSpec(text).skipped).toEqual([
      expect.objectContaining({ method: "PATTERN", path: "#/definitions/Zone/properties/name" }),
    ]);
  });

  it("is named once where YAML writes it under an anchor its aliases repeat", () => {
    const text = [
      "openapi: 3.1.0",
      "info: {title: Zones, version: '1'}",
      "paths: {}",
      "components:",
      "  schemas:",
      `    Zone: &zone {type: string, pattern: '${LONG}'}`,
      "    Other: *zone",
    ].join("\n");

    expect(parseSpec(text).skipped.map((left) => left.method)).toEqual(["PATTERN"]);
  });
});

describe("a pattern Studio compiles", () => {
  it("is not listed as left out", () => {
    expect(parseSpec(openapi(SHORT)).skipped).toEqual([]);
  });
});

describe("leaveOutPattern outside a parse", () => {
  it("notes nothing for a later parse to report", () => {
    leaveOutPattern(LONG);

    expect(parseSpec(openapi(SHORT)).skipped).toEqual([]);
  });
});
