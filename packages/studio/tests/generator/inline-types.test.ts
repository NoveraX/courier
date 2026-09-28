/**
 * A map written inline — an object declaring no properties, only what its
 * values are — is typed by its values, wherever it is written: a response,
 * one alternative of a union, a field.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, writeProject } from "../helpers/generated-project";

const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const counts = { type: "object", additionalProperties: { type: "integer", format: "int32" } };

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Store", version: "1" },
    servers: [{ url: "https://store.test" }],
    paths: {
      "/inventory": {
        get: { operationId: "getInventory", tags: ["store"], responses: { "200": { description: "ok", ...json(counts) } } },
      },
      "/stock": {
        get: {
          operationId: "getStock",
          tags: ["store"],
          responses: { "200": { description: "ok", ...json({ $ref: "#/components/schemas/Stock" }) } },
        },
      },
      "/value": {
        get: {
          operationId: "getValue",
          tags: ["store"],
          responses: { "200": { description: "ok", ...json({ oneOf: [{ type: "string" }, counts] }) } },
        },
      },
    },
    components: { schemas: { Stock: counts } },
  }),
);

const CONSUMER = `import { storeApi } from "./src/api/store";

export async function calls(): Promise<void> {
  const inventory: Record<string, number> = await storeApi.store.getInventory();
  // @ts-expect-error the counts are numbers
  const wrong: Record<string, string> = await storeApi.store.getInventory();
  const value = await storeApi.store.getValue();
  const count: number | undefined = typeof value === "string" ? undefined : value.sold;
  const stock: Record<string, number> = await storeApi.store.getStock();
  // @ts-expect-error a named map's values are numbers too
  const wrongStock: Record<string, string> = await storeApi.store.getStock();
  void [inventory, wrong, count, stock, wrongStock];
}
`;

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["none", { validation: "none" }],
  ["types-only", { generateSchemas: false }],
];

let problems = new Map<string, string[]>();

beforeAll(() => {
  problems = new Map(
    VARIANTS.map(([label, options]) => {
      const files = generateCode(SPEC, { type: "openapi", outputDir: "src/api", ...options }, "store");
      const dir = writeProject(`inline-types/${label}`, files, { "consumer.ts": CONSUMER });
      return [label, compileProject(dir, ["consumer.ts"])];
    }),
  );
}, 120_000);

afterAll(() => {
  removeProjects("inline-types");
});

describe("a map written inline", () => {
  it.each(VARIANTS.map(([label]) => label))("is typed by its values, %s", (label) => {
    expect(problems.get(label)).toEqual([]);
  });
});
