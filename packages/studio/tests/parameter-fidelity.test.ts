import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";
import { generateCode, applyImportDefaults } from "../src/apis/generator";

function spec(parameters: unknown[]): string {
  return JSON.stringify({
    openapi: "3.0.0",
    info: { title: "P", version: "1" },
    paths: {
      "/things": {
        get: {
          operationId: "list",
          tags: ["things"],
          parameters,
          responses: { "200": { description: "ok" } },
        },
      },
    },
  });
}

function parameters(parsed: ReturnType<typeof parseSpec>) {
  return parsed.groups.flatMap((g) => g.endpoints).flatMap((e) => e.parameters);
}

function generated(parameters: unknown[]): string {
  return generateCode(
    parseSpec(spec(parameters)),
    applyImportDefaults({ type: "openapi", sourceName: "api", outputDir: "src" }),
  )
    .map((f) => f.content)
    .join("\n");
}

describe("a query parameter", () => {
  it("keeps the values it accepts", () => {
    /* GitHub declares 196 such parameters and Box 39; every one was typed
       `string`. */
    const parsed = parseSpec(
      spec([{ name: "state", in: "query", schema: { type: "string", enum: ["open", "closed"] } }]),
    );

    expect(parameters(parsed)[0]?.enum).toEqual(["open", "closed"]);
    expect(generated([
      { name: "state", in: "query", schema: { type: "string", enum: ["open", "closed"] } },
    ])).toMatch(/state\?: "open" \| "closed"/);
  });

  it("keeps the element type of an array", () => {
    const out = generated([
      { name: "ids", in: "query", schema: { type: "array", items: { type: "integer" } } },
    ]);

    expect(out).toMatch(/ids\?: number\[\]/);
  });

  it("keeps its format", () => {
    const parsed = parseSpec(
      spec([{ name: "since", in: "query", schema: { type: "string", format: "date-time" } }]),
    );

    expect(parameters(parsed)[0]?.format).toBe("date-time");
  });

  it("reads the Swagger 2.0 spelling, where the shape sits on the parameter", () => {
    const parsed = parseSpec(
      JSON.stringify({
        swagger: "2.0",
        info: { title: "P", version: "1" },
        paths: {
          "/things": {
            get: {
              operationId: "list",
              parameters: [{ name: "status", in: "query", type: "string", enum: ["a", "b"] }],
            },
          },
        },
      }),
    );

    expect(parameters(parsed)[0]).toMatchObject({ type: "string", enum: ["a", "b"] });
  });
});

describe("a path parameter", () => {
  it("keeps the values it accepts", () => {
    const out = generated([
      { name: "kind", in: "path", required: true, schema: { type: "string", enum: ["a", "b"] } },
    ]);

    expect(out).toMatch(/kind: "a" \| "b"/);
  });
});
