/**
 * A generated endpoint addressed by a closure — one whose answer is not
 * JSON, say — keeps the kind its verb gives it. A closure hides its verb,
 * so the builder takes it for a write unless the chain says it reads; a
 * GET generated without saying so was uncached and refused by the query
 * hooks, while a POST stays a write.
 */
import { describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { loadGenerated } from "../helpers/generated-project";

const csv = {
  "200": { description: "csv", content: { "text/csv": { schema: { type: "string" } } } },
};

function generate() {
  const spec = parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Reports", version: "1" },
      servers: [{ url: "https://reports.example/v1" }],
      paths: {
        "/reports/daily": {
          get: { operationId: "dailyReport", tags: ["reports"], responses: csv },
        },
        "/reports/exports": {
          post: { operationId: "exportReport", tags: ["reports"], responses: csv },
        },
      },
    }),
  );
  return generateCode(spec, { type: "openapi", outputDir: "src/api" }, "reports");
}

/* The kind the generated source gives one of its endpoints. */
function kindOf(name: string): unknown {
  let value: unknown = loadGenerated(generate(), "src/api/reports/source.ts").reports;
  for (const key of ["options", "groups", "reports", name, "kind"]) {
    value = typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
  }
  return value;
}

describe("an endpoint generated with a closure", () => {
  it("reads when its verb reads", () => {
    expect(kindOf("dailyReport")).toBe("query");
  });

  it("writes when its verb writes", () => {
    expect(kindOf("exportReport")).toBe("mutation");
  });

  it("says it reads right after its closure", () => {
    const source = generate()
      .map((file) => file.content)
      .join("\n");

    expect(source).toMatch(/\.via\(\(http, vars\) => http\.get\([^)]*\)\)\.reads\(\)/);
    expect(source).not.toMatch(/http\.post\([^)]*\)\)\.reads\(\)/);
  });
});
