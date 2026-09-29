/**
 * A flat source writes its base URL as the literal it is, whatever the
 * specification's server URL holds — as a grouped source does.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import {
  compileProject,
  loadGenerated,
  removeProjects,
  writeProject,
} from "../helpers/generated-project";

const URL_WITH_QUOTES = 'https://api.example.com/"evil"/v\\3';

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: URL_WITH_QUOTES }],
    paths: {
      "/pets": { get: { operationId: "listPets", responses: { "200": { description: "ok" } } } },
    },
  }),
);

afterAll(() => {
  removeProjects("generate-flat-source");
});

describe("a flat source", () => {
  const files = generateCode(
    SPEC,
    { type: "openapi", outputDir: "src", groupBy: "single" },
    "shop",
  );

  it("compiles with quotes and a backslash in its base URL", () => {
    const dir = writeProject("generate-flat-source/hostile-url", files);

    expect(compileProject(dir, ["src/shop/index.ts"])).toEqual([]);
  }, 60_000);

  it("keeps the base URL exactly as the specification gives it", () => {
    const { shop } = loadGenerated(files, "src/shop/source.ts");

    expect(Reflect.get(Reflect.get(Object(shop), "options") ?? {}, "baseURL")).toBe(
      URL_WITH_QUOTES,
    );
  });
});
