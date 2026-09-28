/**
 * The auth an import is generated with is a middleware reading its secret
 * on every request: the source loads without it — as Studio's config does,
 * importing every source — and a call made without it fails naming the
 * variable it needs.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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
import { type UpstreamServer, startUpstreamServer } from "../helpers/upstream-server";

function spec(origin: string, scheme: Record<string, unknown>): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: origin }],
      components: { securitySchemes: { auth: scheme } },
      security: [{ auth: [] }],
      paths: {
        "/pets": {
          get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
        },
      },
    }),
  );
}

const SCHEMES: [string, Record<string, unknown>, string, string, string][] = [
  ["bearer", { type: "http", scheme: "bearer" }, "SHOP_TOKEN", "authorization", "Bearer secret"],
  ["basic", { type: "http", scheme: "basic" }, "SHOP_CREDENTIALS", "authorization", "Basic secret"],
  ["an API key", { type: "apiKey", in: "header", name: "X-Api-Key" }, "SHOP_API_KEY", "x-api-key", "secret"],
  ["OAuth 2", { type: "oauth2", flows: {} }, "SHOP_ACCESS_TOKEN", "authorization", "Bearer secret"],
];

let server: UpstreamServer;
const variables = SCHEMES.map(([, , variable]) => variable);

beforeAll(async () => {
  server = await startUpstreamServer([]);
});

afterEach(() => {
  for (const variable of variables) delete process.env[variable];
});

afterAll(async () => {
  await server.close();
  removeProjects("generate-source");
});

describe.each(SCHEMES)("a source generated with %s auth", (label, scheme, variable, header, sent) => {
  const files = () =>
    generateCode(spec(server.origin, scheme), { type: "openapi", outputDir: "src", addAuthMiddleware: true }, "shop");

  it("loads without the variable it reads", () => {
    expect(() => loadGenerated(files(), "src/shop/source.ts")).not.toThrow();
  });

  it("reads the variable on every request", async () => {
    const { shopApi } = loadGenerated(files(), "src/shop/index.ts");
    const listPets = endpointAt(shopApi, "pets", "listPets");
    server.requests.length = 0;

    process.env[variable] = "secret";
    await listPets();
    process.env[variable] = "rotated";
    await listPets();

    expect(server.requests.map((r) => r.headers[header])).toEqual([
      sent,
      sent.replace("secret", "rotated"),
    ]);
  });

  it("fails a call made without the variable, naming it", async () => {
    const { shopApi } = loadGenerated(files(), "src/shop/index.ts");
    server.requests.length = 0;

    await expect(endpointAt(shopApi, "pets", "listPets")()).rejects.toThrow(variable);
    expect(server.requests).toEqual([]);
  });

  it("compiles", () => {
    const dir = writeProject(`generate-source/${label.replaceAll(" ", "-")}`, files());

    expect(compileProject(dir, ["src/shop/index.ts"])).toEqual([]);
  }, 60_000);
});

describe("an import generated flat with auth", () => {
  it("sends the secret too", async () => {
    const files = generateCode(
      spec(server.origin, { type: "http", scheme: "bearer" }),
      { type: "openapi", outputDir: "src", addAuthMiddleware: true, groupBy: "single" },
      "shop",
    );
    const { shopApi } = loadGenerated(files, "src/shop/index.ts");
    server.requests.length = 0;
    process.env.SHOP_TOKEN = "secret";

    await endpointAt(shopApi, "listPets")();

    expect(server.requests.map((r) => r.headers.authorization)).toEqual(["Bearer secret"]);
  });
});
