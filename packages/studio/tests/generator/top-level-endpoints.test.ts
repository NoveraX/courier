/**
 * An endpoint in no group — an operation with no tag, a request at a
 * collection's root, a path no segment groups — sits in the API itself:
 * called as `client.health()`, beside `client.pets.listPets()`. Checked by
 * calling the generated client against a real server, and by compiling the
 * generated code as strictly as a project can.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type GenerateOptions, generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import {
  compileProject,
  generatedCall,
  loadGenerated,
  removeProjects,
  routesFiles,
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { type RecordingServer, startRecordingServer } from "../helpers/recording-server";

let api: RecordingServer;

beforeAll(async () => {
  api = await startRecordingServer(() => ({ contentType: "application/json", body: "{}" }));
});

afterAll(async () => {
  await api.close();
  removeProjects("top-level-endpoints");
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema: object) => ({
  "200": { description: "ok", content: { "application/json": { schema } } },
});
const MONEY = { type: "object", properties: { amount: { type: "integer" } } };

function spec(): string {
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Shop", version: "1" },
    servers: [{ url: `${api.url}/v1` }],
    tags: [{ name: "pets" }, { name: "billing" }],
    paths: {
      "/": { get: { operationId: "root", responses: ok(ref("Money")) } },
      "/health": {
        get: {
          operationId: "health",
          parameters: [{ name: "X-Trace", in: "header", schema: { type: "string" } }],
          responses: ok(ref("Customer")),
        },
      },
      "/pets": { get: { operationId: "listPets", tags: ["pets"], responses: ok(ref("Pet")) } },
      "/billing/customers": {
        get: { operationId: "listCustomers", tags: ["billing"], responses: ok(ref("Customer")) },
      },
    },
    components: {
      schemas: {
        Money: MONEY,
        Pet: { type: "object", properties: { price: ref("Money") } },
        Customer: { type: "object", properties: { balance: ref("Money") } },
      },
    },
  });
}

const generate = (options: Partial<GenerateOptions> = {}) =>
  generateCode(parseSpec(spec()), { type: "openapi", outputDir: "src", ...options }, "shop");

describe("an operation with no tag, beside tagged ones", () => {
  it("is parsed into the API itself, at its whole path", () => {
    const parsed = parseSpec(spec());

    expect(parsed.groups.map((group) => group.name)).toEqual(["", "pets", "billing"]);
    expect(parsed.groups[0]?.endpoints.map((e) => e.path)).toEqual(["/", "/health"]);
    expect(parsed).not.toHaveProperty("untagged");
  });

  it("is generated into the source's own endpoints, beside its groups", () => {
    const source = generate().find((file) => file.path === "src/shop/source.ts")?.content ?? "";

    expect(source).toMatch(
      / {2}endpoints: \{\n {4}root: endpoint\.get\(""\)[^\n]*\n {4}health: endpoint\.get\("health"\)/,
    );
    expect(source).toMatch(/ {2}groups: \{\n {4}pets,\n {4}billing,\n {2}\},/);
    expect(source).toContain(
      'import { headerVariablesMiddleware } from "@noverax/courier/middleware";',
    );
  });

  it.each([
    ["tag", ["health"]],
    ["path", ["health", "health"]],
    ["single", ["health"]],
  ] as const)("is called on the client itself, beside the groups (%s)", async (groupBy, health) => {
    const { shopApi } = loadGenerated(generate({ groupBy }), "src/shop/index.ts");
    const inGroup = (group: string, name: string) =>
      generatedCall(
        { shopApi },
        groupBy === "single" ? ["shopApi", name] : ["shopApi", group, name],
      );

    await generatedCall({ shopApi }, ["shopApi", "root"])();
    expect(api.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/" });
    await generatedCall({ shopApi }, ["shopApi", ...health])({ "X-Trace": "t1" });
    expect(api.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/health" });
    await inGroup("pets", "listPets")();
    expect(api.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/pets" });
  });
});

describe("the code an import with endpoints in no group gets", () => {
  it.each([
    ["zod", { validation: "zod" }],
    ["valibot", { validation: "valibot" }],
    ["arktype", { validation: "arktype" }],
    ["types alone", { validation: "none", generateTypes: true }],
    ["auth and both clients", { addAuthMiddleware: true, generateClient: "both" }],
  ] as const)("compiles as strictly as a project can (%s)", (label, options) => {
    const generated = generate(options);
    const files =
      "generateClient" in options ? [...generated, ...routesFiles(generated, "shop")] : generated;
    const dir = writeProject(`top-level-endpoints/${label.replace(/\W+/g, "-")}`, files);

    expect(
      compileProject(
        dir,
        files.map((file) => file.path),
        {
          ...STRICT,
          noUnusedLocals: true,
          noUnusedParameters: true,
          verbatimModuleSyntax: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
        },
      ),
    ).toEqual([]);
  });
});

describe("a Postman request at the collection's root", () => {
  it("sits in the API itself, and its folders are its groups", async () => {
    const collection = JSON.stringify({
      info: {
        name: "Acme",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [
        { name: "Ping", request: { method: "GET", url: `${api.url}/pm/ping` } },
        {
          name: "Users",
          item: [{ name: "List users", request: { method: "GET", url: `${api.url}/pm/users` } }],
        },
      ],
    });
    const parsed = parseSpec(collection);
    const files = generateCode(parsed, { type: "postman", outputDir: "src" }, "acme");
    const { acmeApi } = loadGenerated(files, "src/acme/index.ts");

    await generatedCall({ acmeApi }, ["acmeApi", "ping"])();

    expect(parsed.groups.map((group) => group.name)).toEqual(["", "users"]);
    expect(api.requests.at(-1)).toMatchObject({ method: "GET", path: "/pm/ping" });
  });
});
