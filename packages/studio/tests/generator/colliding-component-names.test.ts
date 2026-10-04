/**
 * Component schemas whose names normalise to one identifier — `OrderItem`,
 * `order-item`, `order_item`. Their declarations are numbered apart, and a
 * reference names the declaration of the schema it points at, not the
 * first one the normalised name gives: `order-item`'s answers are typed and
 * validated as its own, not refused for lacking the fields of `OrderItem`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const SCHEMAS = {
  OrderItem: { type: "object", required: ["sku"], properties: { sku: { type: "string" } } },
  "order-item": { type: "object", required: ["price"], properties: { price: { type: "number" } } },
  order_item: { type: "object", required: ["qty"], properties: { qty: { type: "integer" } } },
};

function operation(id: string, ref: string, swagger: boolean) {
  const schema = { $ref: ref };
  return {
    get: {
      operationId: id,
      tags: ["shop"],
      ...(swagger && { produces: ["application/json"] }),
      responses: {
        "200": swagger
          ? { description: "ok", schema }
          : { description: "ok", content: { "application/json": { schema } } },
      },
    },
  };
}

function spec(origin: string, swagger: boolean): ParsedSpec {
  const at = swagger ? "#/definitions/" : "#/components/schemas/";
  const paths = {
    "/x": operation("getX", `${at}OrderItem`, swagger),
    "/y": operation("getY", `${at}order-item`, swagger),
    "/z": operation("getZ", `${at}order_item`, swagger),
  };
  const document = swagger
    ? {
        swagger: "2.0",
        info: { title: "Shop", version: "1" },
        host: new URL(origin).host,
        schemes: ["http"],
        definitions: SCHEMAS,
        paths,
      }
    : {
        openapi: "3.0.0",
        info: { title: "Shop", version: "1" },
        servers: [{ url: origin }],
        components: { schemas: SCHEMAS },
        paths,
      };
  return parseSpec(JSON.stringify(document));
}

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer(
    {},
    {
      "/x": { contentType: "application/json", body: '{"sku":"A-1"}' },
      "/y": { contentType: "application/json", body: '{"price":9.5}' },
      "/z": { contentType: "application/json", body: '{"qty":3}' },
    },
  );
});

afterAll(async () => {
  await upstream.close();
});

describe.each([
  ["OpenAPI 3", false],
  ["Swagger 2", true],
])("in %s, each of three schemas named alike", (_label, swagger) => {
  it("is referenced by its own identifier", () => {
    const parsed = spec(upstream.origin, swagger);
    const refs = parsed.groups.flatMap((group) =>
      group.endpoints.map((ep) => ep.responseSchema?.refName),
    );

    expect(refs).toEqual(["OrderItem", "OrderItem2", "OrderItem3"]);
    expect(Object.keys(parsed.schemas).sort()).toEqual(["OrderItem", "OrderItem2", "OrderItem3"]);
  });

  it("validates each answer against its own schema", async () => {
    const files = generateCode(
      spec(upstream.origin, swagger),
      { type: "openapi", outputDir: "src/api" },
      "shop",
    );
    const { shopApi } = loadGenerated(files, "src/api/shop/index.ts");

    const answers = await Promise.all(
      ["getX", "getY", "getZ"].map((method) => endpointAt(shopApi, "shop", method)()),
    );

    expect(answers).toEqual([{ sku: "A-1" }, { price: 9.5 }, { qty: 3 }]);
  });
});

describe("a component named like another's schema constant", () => {
  afterAll(() => {
    removeProjects("colliding-component-names");
  });

  it("takes another name, so no import names two things", () => {
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Names", version: "1" },
        paths: {
          "/pet": {
            get: {
              operationId: "getPet",
              tags: ["things"],
              responses: {
                "200": {
                  description: "ok",
                  content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
                },
              },
            },
          },
          "/raw": {
            get: {
              operationId: "raw",
              tags: ["things"],
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/PetSchema" } },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Pet: { type: "object", properties: { id: { type: "integer" } } },
            PetSchema: { type: "object", properties: { kind: { type: "string" } } },
          },
        },
      }),
    );
    const files = generateCode(spec, { type: "openapi", outputDir: "src/api" }, "names");
    const dir = writeProject("colliding-component-names/schema-suffix", files);

    expect(Object.keys(spec.schemas)).toEqual(["Pet", "PetSchema2"]);
    expect(compileProject(dir, ["src/api/names/index.ts"])).toEqual([]);
  }, 60_000);
});
