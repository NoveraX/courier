/**
 * What a Postman request turns into, checked by calling the generated client
 * against a real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, loadGenerated } from "../../helpers/generated-project";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

let server: RecordingServer;

beforeAll(async () => {
  server = await startRecordingServer(() => ({ contentType: "application/json", body: "{}" }));
});

afterAll(async () => {
  await server.close();
});

function collection(item: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    info: {
      name: "Acme",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [{ name: "Users", item }],
    ...extra,
  });
}

function call(spec: string, name: string) {
  const files = generateCode(parseSpec(spec), { type: "postman", outputDir: "src" }, "acme");
  return generatedCall(loadGenerated(files, "src/acme/index.ts"), ["acmeApi", "users", name]);
}

describe("a Postman parameter named with a hyphen", () => {
  it("is sent under its own name in the query, and fills its path segment", async () => {
    const spec = collection([
      {
        name: "List posts",
        request: {
          method: "GET",
          url: {
            raw: `${server.url}/users/:user-id/posts?per-page=10`,
            host: [server.url],
            path: ["users", ":user-id", "posts"],
            query: [{ key: "per-page", value: "10" }],
          },
        },
      },
    ]);

    await call(spec, "listPosts")({ user_id: "u1", "per-page": 10 });

    expect(server.requests.at(-1)).toMatchObject({
      path: "/users/u1/posts",
      query: [["per-page", "10"]],
    });
  });
});

describe("a request whose URL is a plain string", () => {
  const spec = () =>
    collection(
      [{ name: "Delete user", request: { method: "DELETE", url: "{{baseUrl}}/users/:id" } }],
      {
        variable: [{ key: "baseUrl", value: server.url }],
      },
    );

  it("reads a leading {{variable}} as the host, not as a path parameter", () => {
    const endpoint = parseSpec(spec()).groups[0]?.endpoints[0];

    expect(endpoint?.fullPath).toBe("/users/:id");
    expect(endpoint?.parameters.map((parameter) => parameter.name)).toEqual(["id"]);
  });

  it("is called with its path parameters alone", async () => {
    await call(spec(), "deleteUser")({ id: "u1" });

    expect(server.requests.at(-1)).toMatchObject({ method: "DELETE", path: "/users/u1" });
  });
});

describe("a request whose path puts a colon inside a segment, as Google's methods do", () => {
  const spec = () =>
    collection(
      [
        {
          name: "Revoke sessions",
          request: { method: "POST", url: "{{baseUrl}}/users/:id/sessions:revoke" },
        },
      ],
      { variable: [{ key: "baseUrl", value: server.url }] },
    );

  it("takes the colon for text, and a segment Postman starts with one for its variable", () => {
    const endpoint = parseSpec(spec()).groups[0]?.endpoints[0];

    expect(endpoint?.parameters.map((parameter) => parameter.name)).toEqual(["id"]);
    expect(endpoint?.path).toBe("/sessions::revoke");
  });

  it("is sent with the colon as Postman writes it", async () => {
    await call(spec(), "revokeSessions")({ id: "u1" });

    expect(server.requests.at(-1)).toMatchObject({
      method: "POST",
      path: "/users/u1/sessions:revoke",
    });
  });
});

describe("a request whose body Postman writes in GraphQL mode", () => {
  const spec = () =>
    collection(
      [
        {
          name: "Search",
          request: {
            method: "POST",
            url: "{{baseUrl}}/graphql",
            body: { mode: "graphql", graphql: { query: "{ users { id } }", variables: "" } },
          },
        },
      ],
      { variable: [{ key: "baseUrl", value: server.url }] },
    );

  it("takes the query, its variables and the operation's name", () => {
    const body = parseSpec(spec()).groups[0]?.endpoints[0]?.requestBody;

    expect(body?.required).toEqual(["query"]);
    expect(Object.keys(body?.properties ?? {})).toEqual(["query", "variables", "operationName"]);
  });

  it("is sent as GraphQL over HTTP sends it: JSON with the query and its variables", async () => {
    await call(spec(), "search")({ query: "{ users { id } }", variables: { first: 2 } });

    const request = server.requests.at(-1);
    expect(request).toMatchObject({ method: "POST", path: "/graphql" });
    expect(JSON.parse(request?.body ?? "")).toEqual({
      query: "{ users { id } }",
      variables: { first: 2 },
    });
  });
});

describe("a raw JSON body with comments and trailing commas", () => {
  it("is typed by its fields, as Postman strips them before sending", () => {
    const spec = collection([
      {
        name: "Order",
        request: {
          method: "POST",
          url: "{{baseUrl}}/orders",
          body: {
            mode: "raw",
            raw: '{\n  // the order\n  "id": "a",\n  "total": 1,\n}',
            options: { raw: { language: "json" } },
          },
        },
      },
    ]);

    const body = parseSpec(spec).groups[0]?.endpoints[0]?.requestBody;

    expect(Object.keys(body?.properties ?? {})).toEqual(["id", "total"]);
  });
});
