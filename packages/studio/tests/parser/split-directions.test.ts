/**
 * A schema whose fields travel one way only — readOnly ones the server sends,
 * writeOnly ones the client sends — is split into the answer it is read as
 * and the input a request sends. One type serving both left the id every
 * answer carries and the password every request needs optional.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../src/apis/parser";
import { splitDirections } from "../../src/apis/parser/split-directions";
import type { ParsedEndpoint, ParsedSpec } from "../../src/apis/parser/types";

const ref = (name: string): object => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object): object => ({ content: { "application/json": { schema } } });

function spec(schemas: object, paths: object): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "RW", version: "1" },
      servers: [{ url: "https://api.example.com" }],
      components: { schemas },
      paths,
    }),
  );
}

const USER = {
  type: "object",
  required: ["id", "email", "password"],
  properties: {
    id: { type: "string", readOnly: true },
    email: { type: "string" },
    password: { type: "string", writeOnly: true },
  },
};

function endpoint(parsed: ParsedSpec, name: string): ParsedEndpoint | undefined {
  return parsed.groups.flatMap((group) => group.endpoints).find((ep) => ep.name === name);
}

describe("a schema with fields that travel one way", () => {
  const parsed = spec(
    { User: USER, Order: { type: "object", required: ["id", "buyer"], properties: { id: { type: "integer", readOnly: true }, buyer: ref("User") } } },
    {
      "/users": { post: { operationId: "createUser", requestBody: json(ref("User")), responses: { "201": { description: "ok", ...json(ref("User")) } } } },
      "/orders": { post: { operationId: "createOrder", requestBody: json(ref("Order")), responses: { "201": { description: "ok", ...json(ref("Order")) } } } },
    },
  );

  it("is read as the answer, with the fields the server sends as required as declared", () => {
    expect(Object.keys(parsed.schemas.User?.properties ?? {})).toEqual(["id", "email"]);
    expect(parsed.schemas.User?.required).toEqual(expect.arrayContaining(["id", "email"]));
  });

  it("is sent as its input, with the fields the client sends as required as declared", () => {
    expect(Object.keys(parsed.schemas.UserInput?.properties ?? {})).toEqual(["email", "password"]);
    expect(parsed.schemas.UserInput?.required).toEqual(expect.arrayContaining(["email", "password"]));
    expect(endpoint(parsed, "createUser")?.requestBody?.refName).toBe("UserInput");
    expect(endpoint(parsed, "createUser")?.responseSchema?.refName).toBe("User");
  });

  it("splits a schema that refers to one, sending the input it refers to", () => {
    expect(parsed.schemas.OrderInput?.properties?.buyer?.refName).toBe("UserInput");
    expect(parsed.schemas.Order?.properties?.buyer?.refName).toBe("User");
    expect(parsed.schemas.OrderInput?.properties?.id).toBeUndefined();
  });

  it("is split once: splitting again changes nothing", () => {
    expect(splitDirections(parsed)).toEqual(parsed);
  });
});

describe("the input twin of a schema", () => {
  it("is left out for one only ever answered", () => {
    const parsed = spec(
      { Audit: { type: "object", required: ["at", "secret"], properties: { at: { type: "string", readOnly: true }, secret: { type: "string", writeOnly: true } } } },
      { "/audits": { get: { operationId: "listAudits", responses: { "200": { description: "ok", ...json({ type: "array", items: ref("Audit") }) } } } } },
    );

    expect(Object.keys(parsed.schemas)).toEqual(["Audit"]);
    expect(Object.keys(parsed.schemas.Audit?.properties ?? {})).toEqual(["at"]);
  });

  it("takes another name when the specification has a schema by its name", () => {
    const parsed = spec(
      { User: USER, UserInput: { type: "object", properties: { legacy: { type: "boolean" } } } },
      { "/users": { post: { operationId: "createUser", requestBody: json(ref("User")), responses: { "204": { description: "done" } } } } },
    );

    expect(endpoint(parsed, "createUser")?.requestBody?.refName).toBe("UserInput2");
    expect(Object.keys(parsed.schemas.UserInput?.properties ?? {})).toEqual(["legacy"]);
  });

  it("refers to itself where the schema does, without end", () => {
    const parsed = spec(
      { Node: { type: "object", required: ["id", "children"], properties: { id: { type: "string", readOnly: true }, children: { type: "array", items: ref("Node") } } } },
      { "/trees": { put: { operationId: "putTree", requestBody: json(ref("Node")), responses: { "200": { description: "ok", ...json(ref("Node")) } } } } },
    );

    expect(parsed.schemas.NodeInput?.properties?.children?.items?.refName).toBe("NodeInput");
    expect(parsed.schemas.Node?.properties?.children?.items?.refName).toBe("Node");
  });
});

describe("a body or answer written inline", () => {
  it("drops the fields that travel the other way", () => {
    const parsed = spec(
      {},
      {
        "/login": {
          post: {
            operationId: "login",
            requestBody: json({ type: "object", required: ["session", "user"], properties: { session: { type: "string", readOnly: true }, user: { type: "string" } } }),
            responses: { "200": { description: "ok", ...json({ type: "object", required: ["token", "echo"], properties: { token: { type: "string", writeOnly: true }, echo: { type: "string" } } }) } },
          },
        },
      },
    );

    expect(Object.keys(endpoint(parsed, "login")?.requestBody?.properties ?? {})).toEqual(["user"]);
    expect(Object.keys(endpoint(parsed, "login")?.responseSchema?.properties ?? {})).toEqual(["echo"]);
  });
});
