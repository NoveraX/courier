/**
 * A long union validated with ArkType, as OpenAI's response items and
 * GitHub's timeline events are unions of some thirty members. Joined two at
 * a time in ArkType's tuple form, it took the compiler past its
 * instantiation depth (TS2589) and the file did not compile; joined with
 * `type.or`, it compiles and validates each member.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { generatedProject, loadGenerated } from "../helpers/generated-project";

const MEMBERS = 40;
const project = generatedProject("arktype-long-unions");

afterAll(() => {
  project.remove();
});

function spec(): string {
  const schemas: Record<string, unknown> = {};
  for (let index = 0; index < MEMBERS; index++) {
    schemas[`Event${index}`] = {
      type: "object",
      required: ["kind", `field${index}`],
      properties: {
        kind: { type: "string", enum: [`kind${index}`] },
        [`field${index}`]: { type: "integer" },
      },
    };
  }
  schemas.Event = {
    oneOf: Array.from({ length: MEMBERS }, (_, index) => ({
      $ref: `#/components/schemas/Event${index}`,
    })),
  };
  const answer = {
    content: { "application/json": { schema: { $ref: "#/components/schemas/Event" } } },
  };
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Events", version: "1" },
    servers: [{ url: "https://api.example.com" }],
    components: { schemas },
    paths: { "/event": { get: { operationId: "getEvent", responses: { "200": answer } } } },
  });
}

interface StandardSchema {
  "~standard": { validate: (value: unknown) => { issues?: unknown } | Promise<unknown> };
}

function isSchema(value: unknown): value is StandardSchema {
  return typeof value === "function" || (typeof value === "object" && value !== null);
}

function accepts(schema: unknown, value: unknown): boolean {
  if (!isSchema(schema)) throw new Error("schema was not generated");
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("expected a synchronous validator");
  return result.issues === undefined;
}

describe(`a union of ${MEMBERS} members validated with ArkType`, () => {
  const files = generateCode(parseSpec(spec()), {
    type: "openapi",
    sourceName: "events",
    outputDir: "src",
    validation: "arktype",
  });

  it("compiles", () => {
    expect(project.diagnostics("arktype", files)).toEqual([]);
  });

  it("accepts each member and nothing else", () => {
    const schemas = loadGenerated(
      files,
      files.find((f) => f.path.endsWith("schemas.ts"))?.path ?? "",
    );

    expect(accepts(schemas.EventSchema, { kind: "kind0", field0: 1 })).toBe(true);
    expect(accepts(schemas.EventSchema, { kind: "kind39", field39: 2 })).toBe(true);
    expect(accepts(schemas.EventSchema, { kind: "kind39", field0: 2 })).toBe(false);
    expect(accepts(schemas.EventSchema, { kind: "other" })).toBe(false);
  });
});
