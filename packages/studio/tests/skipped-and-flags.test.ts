import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";
import { generateCode } from "../src/apis/generator";

function parse(paths: Record<string, unknown>, components?: Record<string, unknown>) {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "S", version: "1" },
      paths,
      ...(components && { components: { schemas: components } }),
    }),
  );
}

describe("a path item this document cannot read", () => {
  it("is recorded rather than dropped in silence", () => {
    /* DigitalOcean writes every path as a reference into another file. */
    const spec = parse({ "/things": { $ref: "resources/things.yml" } });

    expect(spec.skipped).toHaveLength(1);
    expect(spec.skipped[0]).toMatchObject({ path: "/things" });
    expect(spec.skipped[0]?.reason).toContain("resources/things.yml");
  });

  it("records an empty one too", () => {
    const spec = parse({ "/things": null });

    expect(spec.skipped.map((s) => s.path)).toEqual(["/things"]);
  });
});

describe("generateTypes: false", () => {
  it("writes no type at all", () => {
    const out = generateCode(
      parse(
        {
          "/things": {
            get: {
              operationId: "list",
              tags: ["things"],
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Status" } },
                  },
                },
              },
            },
          },
        },
        { Status: { type: "string", enum: ["open", "closed"] } },
      ),
      {
        type: "openapi",
        sourceName: "api",
        outputDir: "src",
        generateTypes: false,
      },
    )
      .map((f) => f.content)
      .join("\n");

    expect(out).not.toMatch(/export type /);
    expect(out).toMatch(/export const StatusSchema/);
  });
});

describe("a property the server generates", () => {
  it("is not demanded of a request", () => {
    /* GitHub marks 59 properties `readOnly` and Box 4; demanding them made a
       request body impossible to construct. */
    const spec = parse({}, {
      Thing: {
        type: "object",
        properties: { id: { type: "string", readOnly: true }, name: { type: "string" } },
        required: ["id", "name"],
      },
    });

    expect(spec.schemas.Thing?.properties?.id?.required).toBe(false);
    expect(spec.schemas.Thing?.properties?.name?.required).toBe(true);
    expect(spec.schemas.Thing?.required).toEqual(["name"]);
  });
});
