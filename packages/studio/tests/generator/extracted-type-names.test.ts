/**
 * A type extracted from an endpoint never takes a name something else has:
 * a schema the specification declares, or the type another group extracts.
 * Otherwise the specification's schema would replace it, and the endpoint
 * be typed and validated as that schema; or the barrel would export the
 * name once, leaving the other group's type out of reach.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { extractedTypeNames } from "../../src/apis/generator/extracted-type-names";
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

const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const query = (name: string, type: string) => ({ name, in: "query", schema: { type } });

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: origin }],
      paths: {
        "/items": {
          get: {
            operationId: "listItems",
            tags: ["items"],
            parameters: [query("page", "integer"), query("q", "string")],
            responses: {
              "200": {
                description: "ok",
                ...json({
                  type: "object",
                  required: ["total"],
                  properties: {
                    total: { type: "integer" },
                    items: { type: "array", items: { type: "string" } },
                  },
                }),
              },
            },
          },
        },
        "/a/list": {
          get: {
            operationId: "list",
            tags: ["a"],
            responses: {
              "200": {
                description: "ok",
                ...json({ type: "object", properties: { x: { type: "string" } } }),
              },
            },
          },
        },
        "/b/list": {
          get: {
            operationId: "list",
            tags: ["b"],
            responses: {
              "200": {
                description: "ok",
                ...json({ type: "object", properties: { y: { type: "number" } } }),
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ListItemsParams: {
            type: "object",
            required: ["color"],
            properties: { color: { type: "string" } },
          },
          ListItemsResponse: {
            type: "object",
            required: ["legacy"],
            properties: { legacy: { type: "boolean" } },
          },
        },
      },
    }),
  );
}

const CONSUMER = `import { shopApi } from "./src/api/shop";
import type { AListResponse, BListResponse } from "./src/api/shop";

export async function calls(): Promise<void> {
  const items = await shopApi.items.listItems({ page: 1, q: "x" });
  const total: number = items.total;
  // @ts-expect-error the endpoint takes a page and a query, not the declared schema's color
  await shopApi.items.listItems({ color: "red" });
  const a: AListResponse = await shopApi.a.list();
  const b: BListResponse = await shopApi.b.list();
  const x: string | undefined = a.x;
  const y: number | undefined = b.y;
  void [total, x, y];
}
`;

let server: UpstreamServer;

beforeAll(async () => {
  server = await startUpstreamServer({ total: 1, items: ["a"] });
});

afterAll(async () => {
  await server.close();
  removeProjects("extracted-type-names");
});

describe.each(["zod", "valibot", "arktype", "none"] as const)(
  "types extracted with %s",
  (validation) => {
    const generate = () =>
      generateCode(
        spec(server.origin),
        { type: "openapi", outputDir: "src/api", validation },
        "shop",
      );

    it("take names nothing else has, each reachable from the barrel", () => {
      const dir = writeProject(`extracted-type-names/${validation}`, generate(), {
        "consumer.ts": CONSUMER,
      });

      expect(compileProject(dir, ["consumer.ts"])).toEqual([]);
    }, 60_000);

    it("validate the response the endpoint really returns", async () => {
      const { shopApi } = loadGenerated(generate(), "src/api/shop/index.ts");

      await expect(endpointAt(shopApi, "items", "listItems")({ page: 1, q: "x" })).resolves.toEqual(
        {
          total: 1,
          items: ["a"],
        },
      );
    });
  },
);

describe("the name a type takes", () => {
  it("does not change when fewer endpoints are selected", () => {
    const selected = generateCode(
      spec(server.origin),
      { type: "openapi", outputDir: "src/api", selectedEndpoints: { b: ["list"] } },
      "shop",
    );
    const schemas = selected.find((f) => f.path.endsWith("/b/schemas.ts"))?.content ?? "";

    expect(schemas).toContain("export type BListResponse");
  });
});

describe("a type extracted from an endpoint whose name starts with a digit", () => {
  const object = (property: string) => ({
    type: "object",
    properties: { [property]: { type: "string" } },
  });
  const ok = (property: string) => ({ "200": { description: "ok", ...json(object(property)) } });
  const DIGITS = parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: "https://shop.example" }],
      paths: {
        "/a/model": {
          get: {
            operationId: "3d",
            tags: ["a"],
            parameters: [query("q", "string")],
            responses: ok("x"),
          },
        },
        "/a/verify": {
          post: {
            operationId: "2fa-verify",
            tags: ["a"],
            requestBody: { required: true, ...json(object("code")) },
            responses: ok("passed"),
          },
        },
        "/b/model": { get: { operationId: "3d", tags: ["b"], responses: ok("y") } },
        "/top": { get: { operationId: "7up", responses: ok("z") } },
      },
    }),
  );
  const DIGITS_CONSUMER = `import { shopApi } from "./src/api/shop";
import type {
  A_3dResponse,
  B_3dResponse,
  _2faVerifyParams,
  _2faVerifyResponse,
  _7upResponse,
} from "./src/api/shop";

export async function calls(): Promise<void> {
  const a: A_3dResponse = await shopApi.a["3d"]({ q: "cube" });
  const b: B_3dResponse = await shopApi.b["3d"]();
  const code: _2faVerifyParams = { code: "123456" };
  const verified: _2faVerifyResponse = await shopApi.a["2faVerify"](code);
  const top: _7upResponse = await shopApi["7up"]();
  void [a.x, b.y, verified.passed, top.z];
}
`;

  it.each(["zod", "valibot", "arktype", "none"] as const)(
    "is an identifier, unique, and named alike wherever %s code uses it",
    (validation) => {
      const files = generateCode(
        DIGITS,
        { type: "openapi", outputDir: "src/api", validation },
        "shop",
      );
      const dir = writeProject(`extracted-type-names/digits-${validation}`, files, {
        "consumer.ts": DIGITS_CONSUMER,
      });

      expect(compileProject(dir, ["consumer.ts", ...files.map((file) => file.path)])).toEqual([]);
    },
    60_000,
  );

  it("leaves a name that reads as an identifier already as it always was", () => {
    const [group] = DIGITS.groups.filter((candidate) => candidate.name === "b");
    if (group === undefined) throw new Error("the spec has no group b");
    const renamed = {
      ...group,
      endpoints: group.endpoints.map((ep) => ({ ...ep, name: "getHTTPStatus" })),
    };

    const names = extractedTypeNames([renamed], []);

    expect(names.nameOf("b", "getHTTPStatus", "Response")).toBe("GetHTTPStatusResponse");
    expect(extractedTypeNames([group], []).nameOf("b", "3d", "Response")).toBe("_3dResponse");
  });
});
