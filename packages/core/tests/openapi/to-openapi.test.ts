/**
 * An API's definition written as an OpenAPI document: every operation where
 * Courier sends it, its schemas as JSON Schema, its session as security
 * schemes — and every document valid against the OpenAPI Initiative's own
 * schema for its version.
 */
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { courier, defineApi, defineGroup, formBody } from "../../src/define";
import { type OpenAPIDocument, type SkippedEndpoint, toOpenAPI } from "../../src/openapi";

const { endpoint, stream, channel } = courier();

/* The OpenAPI Initiative's schema "without schema validation" leaves each Schema Object to the
   dialect, which it reaches by a dynamic reference; read statically, the document's own structure
   is checked here, and every Schema Object in it against JSON Schema 2020-12 below. */
function validator(version: "3.1" | "3.2") {
  const text = readFileSync(
    new URL(`../fixtures/openapi/schema-${version}.json`, import.meta.url),
    "utf8",
  );
  const schema: unknown = JSON.parse(
    text.replaceAll('"$dynamicRef": "#meta"', '"$ref": "#/$defs/schema"'),
  );
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  return { document: ajv.compile(schema as object), ajv };
}

function schemasIn(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const item of value) schemasIn(item, found);
  else if (typeof value === "object" && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      if (key === "schema" || key === "itemSchema") found.push(inner);
      if (key === "schemas" && typeof inner === "object" && inner !== null)
        found.push(...Object.values(inner));
      schemasIn(inner, found);
    }
  }
  return found;
}

function expectValid(document: OpenAPIDocument, version: "3.1" | "3.2" = "3.1"): void {
  const { document: validate, ajv } = validator(version);
  expect(validate(document) ? [] : validate.errors).toEqual([]);
  for (const schema of schemasIn(document)) {
    expect(ajv.validateSchema(schema as object) ? [] : ajv.errors).toEqual([]);
  }
}

const User = z.object({ id: z.string(), name: z.string(), joined: z.date().optional() });

const shop = defineApi({
  name: "shop",
  baseURL: "https://api.example.com/v1",
  session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
  endpoints: {
    health: endpoint.get("health", { session: false }).response(z.object({ ok: z.boolean() })),
  },
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        get: endpoint
          .get(":id")
          .variables(z.object({ id: z.string(), expand: z.boolean().optional() }))
          .response(User),
        rename: endpoint
          .patch(":id")
          .variables(z.object({ id: z.string(), name: z.string() }))
          .response(User),
        remove: endpoint
          .del(":id", { deprecated: "users are archived now" })
          .variables(z.object({ id: z.string() })),
        list: endpoint
          .meta({ summary: "Every user", description: "Newest first." })
          .get("")
          .response(z.array(User)),
      },
    }),
  },
});

describe("an API written as OpenAPI", () => {
  it("names each operation by its call, tags it by its group, and places its variables where they go", () => {
    const document = toOpenAPI(shop, { info: { version: "1.2.0" } });

    expect(document.info).toEqual({ title: "shop", version: "1.2.0" });
    expect(document.servers).toEqual([{ url: "https://api.example.com/v1" }]);
    const get = document.paths["/users/{id}"]?.get;
    expect(get?.operationId).toBe("users.get");
    expect(get?.tags).toEqual(["users"]);
    expect(get?.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "expand", in: "query", required: false, schema: { type: "boolean" } },
    ]);
    const rename = document.paths["/users/{id}"]?.patch;
    expect(rename?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: { properties: { name: { type: "string" } }, required: ["name"] },
        },
      },
    });
    expect(JSON.stringify(rename?.requestBody)).not.toContain('"id"');
    expect(document.paths["/users/{id}"]?.delete).toMatchObject({
      operationId: "users.remove",
      deprecated: true,
    });
    expect(document.paths["/users"]?.get).toMatchObject({
      summary: "Every user",
      description: "Newest first.",
    });
    expectValid(document);
  });

  it("writes the session as security schemes, the double-submit header required on writes", () => {
    const document = toOpenAPI(shop);

    expect(document.components?.securitySchemes).toEqual({
      cookie_sid: { type: "apiKey", in: "cookie", name: "sid" },
      csrf: { type: "apiKey", in: "header", name: "x-csrftoken", description: expect.any(String) },
    });
    expect(document.paths["/users/{id}"]?.get?.security).toEqual([{ cookie_sid: [] }]);
    expect(document.paths["/users/{id}"]?.patch?.security).toEqual([{ cookie_sid: [], csrf: [] }]);
    expect(document.paths["/health"]?.get?.security).toEqual([]);
  });

  it("leaves a value JSON cannot hold unspecified rather than refusing the schema", () => {
    const answer = toOpenAPI(shop).paths["/users/{id}"]?.get?.responses["200"];

    expect(answer).toMatchObject({
      content: { "application/json": { schema: { properties: { joined: {} } } } },
    });
  });

  it("leaves only the part ArkType cannot describe unspecified: a Date, a check of its own", () => {
    const events = defineApi({
      name: "events",
      baseURL: "https://e.example",
      endpoints: {
        add: endpoint
          .post("events")
          .variables(type({ text: "string" }).narrow((value) => value.text.length > 0))
          .response(type({ at: "Date", id: "string" })),
      },
    });

    const document = toOpenAPI(events);
    const operation = document.paths["/events"]?.post;

    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        },
      },
    });
    expect(operation?.responses["200"]).toMatchObject({
      content: {
        "application/json": { schema: { properties: { at: {}, id: { type: "string" } } } },
      },
    });
    expectValid(document);
  });

  it("describes an ArkType check that carries the schema of what it checks, wherever it sits", () => {
    const fields = type({ id: "string", "constructor?": "string" });
    const check = Object.assign((value: object) => typeof value === "object", {
      "~standard": fields["~standard"],
    });
    const owned = type("object").narrow(check);
    const box = defineApi({
      name: "box",
      baseURL: "https://b.example",
      endpoints: { get: endpoint.get("box").response(type({ thing: owned, list: owned.array() })) },
    });

    const answer = toOpenAPI(box).paths["/box"]?.get?.responses["200"];
    const described = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };

    expect(answer).toMatchObject({
      content: {
        "application/json": {
          schema: { properties: { thing: described, list: { type: "array", items: described } } },
        },
      },
    });
  });

  it("writes an ArkType array with elements after its rest as an array, unspecified", () => {
    const rows = defineApi({
      name: "rows",
      baseURL: "https://r.example",
      endpoints: { get: endpoint.get("rows").response(type(["...", "string[]", "number"])) },
    });

    const answer = toOpenAPI(rows).paths["/rows"]?.get?.responses["200"];

    expect(answer).toMatchObject({
      content: { "application/json": { schema: { type: "array" } } },
    });
    expect(JSON.stringify(answer)).not.toContain('"items"');
  });

  it("moves a recursive schema's definitions to the components, its references with them", () => {
    type TreeNode = { name: string; children?: TreeNode[] | undefined };
    const Node: z.ZodType<TreeNode> = z.object({
      name: z.string(),
      get children() {
        return z.array(Node).optional();
      },
    });
    const tree = defineApi({
      name: "tree",
      baseURL: "https://t.example",
      endpoints: { root: endpoint.get("root").response(z.object({ root: Node })) },
    });

    const document = toOpenAPI(tree);
    const text = JSON.stringify(document);

    expect(text).not.toContain("#/$defs/");
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(["root.response.__schema0"]);
    expect(text).toContain('"$ref":"#/components/schemas/root.response.__schema0"');
    expectValid(document);
  });
});

describe("a body the endpoint writes itself", () => {
  it("is url-encoded for a form, multipart for FormData", () => {
    const forms = defineApi({
      name: "forms",
      baseURL: "https://f.example",
      endpoints: {
        customer: endpoint
          .variables(type({ email: "string" }))
          .via((http, fields) => http.post("customers", undefined, { body: formBody(fields) })),
        avatar: endpoint.via((http) => http.post("avatar", undefined, { body: new FormData() })),
      },
    });

    const document = toOpenAPI(forms);

    expect(Object.keys(document.paths["/customers"]?.post?.requestBody?.content as object)).toEqual(
      ["application/x-www-form-urlencoded"],
    );
    expect(Object.keys(document.paths["/avatar"]?.post?.requestBody?.content as object)).toEqual([
      "multipart/form-data",
    ]);
    expectValid(document);
  });
});

describe("what OpenAPI has no form for", () => {
  const live = defineApi({
    name: "live",
    baseURL: "https://l.example",
    endpoints: {
      ticks: stream.get("ticks").response(z.object({ n: z.number() })),
      room: channel.response(z.string()).via((ws) => ws.connect("room")),
      search: endpoint.query("search").variables(z.object({ q: z.string() })),
      local: stream.response(z.number()).implement(async function* () {
        yield { data: 1 };
      }),
    },
  });

  it("is left out of 3.1 and said why: a channel, an endpoint served here, and QUERY", () => {
    const skipped: SkippedEndpoint[] = [];

    const document = toOpenAPI(live, { onSkip: (one) => skipped.push(one) });

    expect(skipped.map((one) => one.operation)).toEqual(["room", "search", "local"]);
    expect(skipped[1]?.reason).toContain("3.2.0");
    expect(document.paths["/ticks"]?.get?.responses["200"]).toMatchObject({
      content: {
        "text/event-stream": {
          "x-courier-event-schema": { properties: { n: { type: "number" } } },
        },
      },
    });
    expectValid(document);
  });

  it("finds its place in 3.2: QUERY, and a stream's event schema", () => {
    const document = toOpenAPI(live, { openapi: "3.2.0" });

    expect(document.paths["/search"]?.query?.requestBody).toBeDefined();
    expect(document.paths["/ticks"]?.get?.responses["200"]).toMatchObject({
      content: { "text/event-stream": { itemSchema: { properties: { n: { type: "number" } } } } },
    });
    expectValid(document, "3.2");
  });
});

describe("a schema its library cannot describe", () => {
  const notes = defineApi({
    name: "notes",
    baseURL: "https://n.example",
    endpoints: { add: endpoint.post("notes").variables(v.object({ text: v.string() })) },
  });

  it("is unspecified when the fallback converter throws, the rest of the document written", () => {
    const document = toOpenAPI(notes, {
      jsonSchema: () => {
        throw new Error("cannot convert");
      },
    });

    expect(document.paths["/notes"]?.post?.requestBody).toEqual({
      required: false,
      content: { "application/json": {} },
    });
  });

  it("is described by its fields when it keeps the object it checks as fields", () => {
    const fields = v.object({ text: v.string() });
    const wrapper = Object.assign(
      v.pipe(
        v.unknown(),
        v.transform((value) => value),
      ),
      { fields },
    );
    const owned = defineApi({
      name: "owned",
      baseURL: "https://o.example",
      endpoints: { add: endpoint.post("notes").variables(wrapper) },
    });
    const asked: unknown[] = [];

    const body = toOpenAPI(owned, {
      jsonSchema: (schema) => {
        asked.push(schema);
        if (schema !== fields) throw new Error("a pipe cannot be converted");
        return { type: "object", properties: { text: { type: "string" } } };
      },
    }).paths["/notes"]?.post?.requestBody;

    expect(asked).toEqual([fields]);
    expect(body).toMatchObject({ content: { "application/json": { schema: { type: "object" } } } });
  });

  it("is unspecified, or what the fallback converter writes", () => {
    const plain = toOpenAPI(notes).paths["/notes"]?.post?.requestBody;
    const converted = toOpenAPI(notes, {
      jsonSchema: () => ({ type: "object", properties: { text: { type: "string" } } }),
    }).paths["/notes"]?.post?.requestBody;

    expect(plain).toEqual({ required: false, content: { "application/json": {} } });
    expect(converted).toMatchObject({
      required: true,
      content: { "application/json": { schema: { type: "object" } } },
    });
  });
});

describe("an address written into the endpoint", () => {
  it("keeps a query written into the path as a parameter with its one value, and an absolute address as a server", () => {
    const odd = defineApi({
      name: "odd",
      baseURL: "https://o.example",
      endpoints: {
        beta: endpoint.get("models?beta=true"),
        elsewhere: endpoint.get("https://files.example.com/status"),
      },
    });

    const document = toOpenAPI(odd);

    expect(document.paths["/models"]?.get?.parameters).toEqual([
      { name: "beta", in: "query", required: true, schema: { type: "string", enum: ["true"] } },
    ]);
    expect(document.paths["/status"]?.get?.servers).toEqual([{ url: "https://files.example.com" }]);
    expectValid(document);
  });

  it("writes a parameter in braces as OpenAPI does, and says that a {+name} keeps its slashes", () => {
    const google = defineApi({
      name: "google",
      baseURL: "https://g.example",
      endpoints: {
        cancel: endpoint.post("v1/{+name}::cancel"),
        suffixed: endpoint.get("files/{id}abc"),
      },
    });

    const document = toOpenAPI(google);

    expect(document.paths["/v1/{name}:cancel"]?.post?.parameters).toEqual([
      {
        name: "name",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Sent with its slashes as written, each part between them encoded",
      },
    ]);
    expect(document.paths["/files/{id}abc"]?.get?.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
    expectValid(document);
  });
});

describe("variables an endpoint defaults", () => {
  it("carry their default and are not required, whether a schema or a type declares them", () => {
    const site = defineApi({
      name: "site",
      baseURL: "https://s.example",
      endpoints: {
        byGroup: endpoint
          .get("news")
          .variables(z.object({ group: z.string(), groupBy: z.enum(["year", "month"]) }))
          .defaults({ groupBy: "year" }),
        latest: endpoint.get("latest").variables<{ limit: number }>().defaults({ limit: 5 }),
        search: endpoint
          .post("search")
          .variables(z.object({ q: z.string(), size: z.number() }))
          .defaults({ size: 20 }),
      },
    });

    const document = toOpenAPI(site);

    expect(document.paths["/news"]?.get?.parameters).toEqual([
      { name: "group", in: "query", required: true, schema: { type: "string" } },
      {
        name: "groupBy",
        in: "query",
        required: false,
        schema: { type: "string", enum: ["year", "month"], default: "year" },
      },
    ]);
    expect(document.paths["/latest"]?.get?.parameters).toEqual([
      { name: "limit", in: "query", required: false, schema: { type: "integer", default: 5 } },
    ]);
    expect(document.paths["/search"]?.post?.requestBody).toMatchObject({
      content: {
        "application/json": {
          schema: { properties: { size: { type: "number", default: 20 } }, required: ["q"] },
        },
      },
    });
    expectValid(document);
  });
});

describe("the checks themselves", () => {
  it("refuse a document OpenAPI does not allow, so a pass means something", () => {
    const { document: validate, ajv } = validator("3.1");
    const broken = {
      openapi: "3.1.0",
      info: { title: "x", version: "1" },
      paths: { "/a": { get: { parameters: [{ name: "a" }], responses: {} } } },
    };

    expect(validate(broken)).toBe(false);
    expect(ajv.validateSchema({ type: 12 })).toBe(false);
  });
});

describe("nested groups, a bearer cookie and an idempotency key", () => {
  const billing = defineApi({
    name: "billing",
    baseURL: "https://b.example",
    session: { cookies: ["logto_*"], bearer: "access_token" },
    groups: {
      billing: defineGroup({
        prefix: "billing",
        groups: {
          invoices: defineGroup({
            prefix: "invoices",
            endpoints: {
              pay: endpoint
                .post(":id/pay", { idempotencyKey: "header:Idempotency-Key" })
                .variables(z.object({ id: z.string() })),
            },
          }),
        },
      }),
    },
  });

  it("tags a nested group under its parent in 3.2, and writes what the session and the key need", () => {
    const document = toOpenAPI(billing, { openapi: "3.2.0" });
    const pay = document.paths["/billing/invoices/{id}/pay"]?.post;

    expect(pay?.operationId).toBe("billing.invoices.pay");
    expect(pay?.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: false }),
    );
    expect(document.components?.securitySchemes).toMatchObject({
      session_cookies: { type: "apiKey", in: "cookie", name: "logto_" },
      bearer: { type: "http", scheme: "bearer" },
    });
    expect(pay?.security).toEqual([{ session_cookies: [], bearer: [] }]);
    expect(document.tags).toEqual([
      { name: "billing" },
      { name: "billing.invoices", parent: "billing" },
    ]);
    expect(toOpenAPI(billing).tags).toEqual([{ name: "billing" }, { name: "billing.invoices" }]);
    expectValid(document, "3.2");
  });
});
