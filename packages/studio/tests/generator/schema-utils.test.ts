/**
 * A path parameter merged into a body's schema is validated as the
 * specification types it, the same way the endpoint beside it that has no
 * body types it — checked by compiling calls and by making them against a
 * real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  writeProject,
} from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const owner = { $ref: "#/components/schemas/Owner" };
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        "/owners/{ownerId}": {
          get: {
            operationId: "getOwner",
            tags: ["owners"],
            parameters: [
              { name: "ownerId", in: "path", required: true, schema: { type: "integer" } },
            ],
            responses: { "200": { description: "ok", ...json(owner) } },
          },
          patch: {
            operationId: "patchOwner",
            tags: ["owners"],
            parameters: [
              { name: "ownerId", in: "path", required: true, schema: { type: "integer" } },
            ],
            requestBody: json(owner),
            responses: { "200": { description: "ok", ...json(owner) } },
          },
        },
        "/owners/{ownerId}/pets/{petKind}": {
          put: {
            operationId: "putPet",
            tags: ["owners"],
            parameters: [
              { name: "ownerId", in: "path", required: true, schema: { type: "integer" } },
              {
                name: "petKind",
                in: "path",
                required: true,
                schema: { type: "string", enum: ["cat", "dog"] },
              },
            ],
            requestBody: json(owner),
            responses: { "200": { description: "ok", ...json(owner) } },
          },
        },
      },
      components: {
        schemas: {
          Owner: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
        },
      },
    }),
  );
}

const CONSUMER = `import { shopApi } from "./src/api/shop";

export async function calls(): Promise<void> {
  await shopApi.owners.getOwner({ ownerId: 5 });
  await shopApi.owners.patchOwner({ ownerId: 5, name: "Ann" });
  await shopApi.owners.putPet({ ownerId: 5, petKind: "cat", name: "Ann" });
  // @ts-expect-error the owner's id is a number
  await shopApi.owners.patchOwner({ ownerId: "5", name: "Ann" });
  // @ts-expect-error a pet is a cat or a dog
  await shopApi.owners.putPet({ ownerId: 5, petKind: "bird", name: "Ann" });
}
`;

const VALIDATIONS = ["zod", "valibot", "arktype", "none"] as const;

let server: UpstreamServer;

beforeAll(async () => {
  server = await startUpstreamServer({ name: "Ann" });
});

afterAll(async () => {
  await server.close();
  removeProjects("schema-utils");
});

function generate(options: Partial<GenerateOptions>) {
  return generateCode(
    spec(server.origin),
    { type: "openapi", outputDir: "src/api", ...options },
    "shop",
  );
}

describe.each(VALIDATIONS)("a path parameter beside a body, validated with %s", (validation) => {
  it("is typed as the specification types it", () => {
    const dir = writeProject(`schema-utils/${validation}`, generate({ validation }), {
      "consumer.ts": CONSUMER,
    });

    expect(compileProject(dir, ["consumer.ts"])).toEqual([]);
  }, 60_000);

  it("accepts the number the specification asks for, and fills the path with it", async () => {
    const { shopApi } = loadGenerated(generate({ validation }), "src/api/shop/index.ts");
    server.requests.length = 0;

    await endpointAt(shopApi, "owners", "patchOwner")({ ownerId: 5, name: "Ann" });

    expect(server.requests.map((r) => `${r.method} ${r.path} ${r.body}`)).toEqual([
      'PATCH /v1/owners/5 {"name":"Ann"}',
    ]);
  });
});

describe.each(["zod", "valibot", "arktype"] as const)("with %s", (validation) => {
  it("refuses a value outside the parameter's enum before sending anything", async () => {
    const { shopApi } = loadGenerated(generate({ validation }), "src/api/shop/index.ts");
    const putPet = endpointAt(shopApi, "owners", "putPet");
    server.requests.length = 0;

    await expect(putPet({ ownerId: 5, petKind: "bird", name: "Ann" })).rejects.toThrow(
      /Validation failed/,
    );
    expect(server.requests).toEqual([]);
  });
});
