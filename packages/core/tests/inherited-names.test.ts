/**
 * A variable, a field or a header named like a member every object
 * inherits — `__proto__`, `constructor` — is one like any other. Assigned
 * by name, a key `__proto__` set the record's prototype and was lost:
 * from a styled query, the variables left beside a header, a path, the
 * body Studio is shown, merged headers and those a response is written
 * with. Read by name, a `constructor` the caller left out gave Object's
 * own: a default for it was never filled in, a path took the function's
 * text, and an exported schema lost the type its default says. An OpenAPI
 * document lost a property `__proto__` as it moved a schema's references,
 * and typed a path parameter named `constructor` with Object's function.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, formQuery } from "../src/define";
import { withVariableDefaults } from "../src/define/variable-defaults";
import { shownHeaders } from "../src/errors/shown-headers";
import { createFetch } from "../src/fetch";
import { headerVariablesMiddleware } from "../src/middleware";
import { sendWebResponse } from "../src/node";
import { appendSetCookie } from "../src/node-set-cookie";
import { toOpenAPI } from "../src/openapi";
import { withDefaultsShown } from "../src/openapi/variable-defaults";
import { carriedBody } from "../src/studio/carried-body";
import { compileUrl } from "../src/utils/url";
import { type EchoServer, startEchoServer } from "./helpers/echo-server";

/* JSON text keeps a key `__proto__` as the field it names, as a specification's values arrive. */
const own = (json: string): Record<string, unknown> => JSON.parse(json);

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const server of servers.splice(0)) await server.close();
});

/* The headers a client receives from a server answering as `answer` does. */
async function headersFrom(
  answer: (res: ServerResponse, req: IncomingMessage) => void,
): Promise<Headers> {
  const server = createServer((req, res) => answer(res, req));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push({
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/`);
  await response.text();
  return response.headers;
}

describe("a key named __proto__", () => {
  it("is a value of its own of a styled query, repeated or in brackets", () => {
    const query = formQuery(own('{ "__proto__": ["a", "b"], "deep": { "__proto__": 1 } }'), {
      deep: { style: "deepObject", explode: true },
    });

    expect(Object.entries(query)).toEqual([
      ["__proto__", ["a", "b"]],
      ["deep[__proto__]", "1"],
    ]);
  });

  it("fills a path parameter of that name, and stays among the variables beside a header", async () => {
    const upstream: EchoServer = await startEchoServer();
    servers.push(upstream);
    const { endpoint } = courier();
    const api = defineApi({
      name: "things",
      baseURL: upstream.origin,
      endpoints: {
        get: endpoint.get("things/:__proto__").variables<{ __proto__: string }>(),
        find: endpoint
          .get("things")
          .variables<{ __proto__?: string; "X-Trace"?: string }>()
          .use(headerVariablesMiddleware(["X-Trace"])),
      },
    });
    const client = createCaller(api);

    await client.get(own('{ "__proto__": "p" }') as { __proto__: string });
    await client.find(own('{ "__proto__": "q", "X-Trace": "t" }'));

    expect(upstream.received.map((request) => request.url)).toEqual([
      "/things/p",
      "/things?__proto__=q",
    ]);
    expect(upstream.received[1]?.headers["x-trace"]).toBe("t");
  });

  it("is a field of its own of the body Studio is shown, cut or whole", () => {
    const { value } = carriedBody(own(`{ "__proto__": "p", "big": "${"x".repeat(40_000)}" }`));

    expect(Object.hasOwn(value as object, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });

  it("is a header of its own when a call's headers are laid over the client's", async () => {
    const sent: Headers[] = [];
    vi.stubGlobal("fetch", async (input: Request | URL | string, init?: RequestInit) => {
      sent.push(new Request(input, init).headers);
      return Response.json({});
    });
    const { endpoint } = courier();
    const closure = own('{ "__proto__": "closure" }') as Record<string, string>;
    const api = defineApi({
      name: "things",
      baseURL: "https://api.test",
      endpoints: {
        list: endpoint.get("things"),
        listed: endpoint.via((http) => http.get("things", undefined, { headers: closure })),
      },
    });
    const client = createCaller(api, {
      headers: own('{ "__proto__": "base", "a": "1" }') as Record<string, string>,
    });

    await client.list();
    await client.with({ headers: own('{ "__proto__": "call" }') as Record<string, string> }).list();
    await client.listed();

    expect(sent.map((headers) => [headers.get("__proto__"), headers.get("a")])).toEqual([
      ["base", "1"],
      ["call", "1"],
      ["closure", "1"],
    ]);
  });

  it("is a header of its own when headers are merged, shown or written", async () => {
    const sent: Headers[] = [];
    vi.stubGlobal("fetch", async (input: Request | URL | string, init?: RequestInit) => {
      sent.push(new Request(input, init).headers);
      return Response.json({});
    });

    await createFetch({ baseURL: "https://api.test", headers: { a: "1" } }).get("x", {
      headers: new Headers([["__proto__", "p"]]),
    });
    await createFetch({ baseURL: "https://api.test" }).get("x", {
      headers: own('{ "__proto__": "r" }') as Record<string, string>,
    });
    const shown = shownHeaders(new Headers([["__proto__", "p"]]));
    vi.unstubAllGlobals();
    const written = await headersFrom((res) => {
      void sendWebResponse(new Response("ok", { headers: new Headers([["__proto__", "w"]]) }), res);
    });
    const kept = await headersFrom((res) => {
      appendSetCookie(res, "a=1");
      res.writeHead(200, own('{ "__proto__": "k" }') as Record<string, string>);
      res.end();
    });

    expect(sent.map((headers) => headers.get("__proto__"))).toEqual(["p", "r"]);
    expect(Object.entries(shown)).toEqual([["__proto__", "p"]]);
    expect(written.get("__proto__")).toBe("w");
    expect(kept.get("__proto__")).toBe("k");
  });
});

describe("a name every object inherits that the caller left out", () => {
  it("takes its default", () => {
    const merged = withVariableDefaults(own('{ "constructor": "c", "__proto__": "d" }'), { q: 1 });

    expect(Object.entries(merged as object)).toEqual([
      ["q", 1],
      ["constructor", "c"],
      ["__proto__", "d"],
    ]);
  });

  it("is a missing path parameter, not Object's text", () => {
    expect(() => compileUrl("things/:constructor", { q: 1 })).toThrow(
      'Missing required path parameter "constructor"',
    );
  });

  it("is shown in an exported schema as its default's own type", () => {
    const shown = withDefaultsShown(
      { type: "object", properties: { q: { type: "string" } } },
      own('{ "constructor": "c", "__proto__": 2 }'),
    );

    expect(shown?.properties).toEqual(
      own(
        '{ "q": { "type": "string" }, "constructor": { "type": "string", "default": "c" }, "__proto__": { "type": "integer", "default": 2 } }',
      ),
    );
  });
});

/* A schema whose library describes it as the JSON text says, as one that keeps a field `__proto__` does. */
function describedAs(json: string): StandardSchemaV1 & StandardJSONSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => ({ value }),
      jsonSchema: { input: () => own(json), output: () => own(json) },
    },
  };
}

describe("an OpenAPI document", () => {
  it("keeps a property named __proto__ as a property, its reference moved with it", () => {
    const { endpoint } = courier();
    const api = defineApi({
      name: "things",
      baseURL: "https://t.example",
      endpoints: {
        add: endpoint
          .post("things")
          .variables(
            describedAs(
              '{ "type": "object", "properties": { "__proto__": { "$ref": "#/$defs/Tag" } }, "$defs": { "Tag": { "type": "string" } } }',
            ),
          ),
      },
    });

    const body = toOpenAPI(api).paths["/things"]?.post?.requestBody;
    const content = body?.content as Record<string, { schema: { properties: object } }> | undefined;
    const properties = content?.["application/json"]?.schema.properties;

    expect(Object.entries(properties ?? {})).toEqual([
      ["__proto__", { $ref: "#/components/schemas/add.variables.Tag" }],
    ]);
  });

  it("types a path parameter named like a member every object has as a string", () => {
    const { endpoint } = courier();
    const api = defineApi({
      name: "things",
      baseURL: "https://t.example",
      endpoints: { get: endpoint.get("things/:constructor").variables<{ constructor: string }>() },
    });

    const parameters = toOpenAPI(api).paths["/things/{constructor}"]?.get?.parameters;

    expect(parameters).toEqual([
      { name: "constructor", in: "path", required: true, schema: { type: "string" } },
    ]);
  });
});
