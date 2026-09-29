/**
 * The type an endpoint is called with has to be the whole of what the
 * specification lets it take — its parameters with the values they allow,
 * and every field of a body written inline — whether the type is extracted
 * under a name or written where it is used. A consumer's calls are compiled
 * against the generated client to prove it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, writeProject } from "../helpers/generated-project";

const described = (name: string, place: string, type = "string") => ({
  name,
  in: place,
  required: place === "path",
  description: `The ${name}`,
  schema: { type },
});

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "https://shop.test/v1" }],
    paths: {
      "/repos/{owner}/{repo}/issues": {
        post: {
          operationId: "issuesCreate",
          tags: ["issues"],
          parameters: [described("owner", "path"), described("repo", "path")],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    body: { type: "string" },
                    labels: { type: "array", items: { type: "string" } },
                    milestone: { oneOf: [{ type: "string" }, { type: "integer" }], nullable: true },
                    state: { type: "string", enum: ["open", "closed"] },
                    meta: { type: "object", properties: { by: { type: "string" } } },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "created" } },
        },
      },
      "/items/{item_id}/labels": {
        patch: {
          operationId: "setLabels",
          tags: ["items"],
          parameters: [
            { name: "item_id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["labels"],
                  properties: {
                    labels: { type: "array", items: { type: "string" } },
                    meta: { type: "object", properties: { by: { type: "string" } } },
                    owner: { $ref: "#/components/schemas/Owner" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "ok" } },
        },
      },
      "/pets": {
        get: {
          operationId: "findPets",
          tags: ["pets"],
          parameters: [
            {
              name: "status",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["available", "pending", "sold"] },
            },
            { name: "tags", in: "query", schema: { type: "array", items: { type: "string" } } },
            {
              name: "created",
              in: "query",
              schema: {
                anyOf: [
                  {
                    type: "object",
                    properties: { gte: { type: "integer" }, lt: { type: "integer" } },
                  },
                  { type: "integer" },
                ],
              },
            },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
    components: {
      schemas: { Owner: { type: "object", properties: { login: { type: "string" } } } },
    },
  }),
);

/** Calls the client has to accept, and calls it has to refuse. */
function consumer(flat: boolean): string {
  const [issues, items, pets] = flat ? ["", "", ""] : ["issues.", "items.", "pets."];
  return `import { shopApi } from "./src/api/shop";

export async function calls(): Promise<void> {
  await shopApi.${issues}issuesCreate({ owner: "o", repo: "r", title: "t", labels: ["bug"], milestone: 3 });
  await shopApi.${issues}issuesCreate({ owner: "o", repo: "r", title: "t", milestone: null, state: "open", meta: { by: "me" } });
  // @ts-expect-error a title is required
  await shopApi.${issues}issuesCreate({ owner: "o", repo: "r" });
  // @ts-expect-error a label is text
  await shopApi.${issues}issuesCreate({ owner: "o", repo: "r", title: "t", labels: [1] });
  // @ts-expect-error the state is one of two words
  await shopApi.${issues}issuesCreate({ owner: "o", repo: "r", title: "t", state: "gone" });

  await shopApi.${items}setLabels({ item_id: 7, labels: ["a"], meta: { by: "me" } });
  // @ts-expect-error the id is a number
  await shopApi.${items}setLabels({ item_id: "7", labels: ["a"] });
  // @ts-expect-error meta.by is text
  await shopApi.${items}setLabels({ item_id: 7, labels: ["a"], meta: { by: 1 } });

  await shopApi.${pets}findPets({ status: "sold", tags: ["a", "b"], created: { gte: 1 } });
  await shopApi.${pets}findPets({ status: "pending", created: 5 });
  // @ts-expect-error the status is one of three words
  await shopApi.${pets}findPets({ status: "not-a-status" });
  // @ts-expect-error a tag is text
  await shopApi.${pets}findPets({ status: "sold", tags: [1] });
  // @ts-expect-error created is a number or a range
  await shopApi.${pets}findPets({ status: "sold", created: "yesterday" });
}
`;
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["types-only", { generateSchemas: false }],
  ["no-types", { generateTypes: false }],
  ["single", { groupBy: "single" }],
];

let problems = new Map<string, string[]>();

beforeAll(() => {
  problems = new Map(
    VARIANTS.map(([label, options]) => {
      const files = generateCode(
        SPEC,
        { type: "openapi", outputDir: "src/api", ...options },
        "shop",
      );
      const flat = options.groupBy === "single";
      const dir = writeProject(`extract-endpoint-types/${label}`, files, {
        "consumer.ts": consumer(flat),
      });
      return [label, compileProject(dir, ["consumer.ts"])];
    }),
  );
}, 180_000);

afterAll(() => {
  removeProjects("extract-endpoint-types");
});

describe("an endpoint's variables", () => {
  it.each(VARIANTS.map(([label]) => label))(
    "take what the specification allows, for %s",
    (label) => {
      expect(problems.get(label)).toEqual([]);
    },
  );

  it("keep an inline body beside parameters extracted under a name", () => {
    const schemas = generateCode(
      SPEC,
      { type: "openapi", outputDir: "src", validation: "none" },
      "shop",
    ).find((f) => f.path.endsWith("issues/schemas.ts"))?.content;

    expect(schemas).toMatch(/export type IssuesCreateParams = \{[^}]*title: string;/s);
  });
});
