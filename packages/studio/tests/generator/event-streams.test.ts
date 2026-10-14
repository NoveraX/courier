/**
 * An operation that answers a GET with a stream of events is generated as a
 * stream a client subscribes to, `stream.get(…)`, and its events are typed
 * by the schema the specification gives them — not as a JSON GET, which would
 * read the stream as one body and fail. A POST that answers with events has
 * no stream builder, and stays an HTTP endpoint. Through the proxy, the
 * stream is relayed from the API.
 */
import { createProxyCaller } from "@noverax/courier";
import type { CourierRoutes } from "@noverax/courier/define";
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
  routesFiles,
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { type ProxyServer, startProxyServer } from "../helpers/proxy-server";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const events = (schema: unknown) => ({
  "200": { description: "events", content: { "text/event-stream": { schema } } },
});
const OrderEvent = {
  type: "object",
  required: ["status"],
  properties: { status: { type: "string" } },
};
const orderId = { name: "id", in: "path", required: true, schema: { type: "string" } };

function spec(origin: string, streamsOnly = false): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        ...(!streamsOnly && {
          "/orders": {
            get: {
              operationId: "listOrders",
              tags: ["orders"],
              responses: {
                "200": {
                  description: "ok",
                  content: { "application/json": { schema: { type: "array", items: OrderEvent } } },
                },
              },
            },
          },
        }),
        "/orders/{id}/events": {
          get: {
            operationId: "watchOrder",
            tags: ["orders"],
            parameters: [orderId, { name: "since", in: "query", schema: { type: "string" } }],
            responses: events({ $ref: "#/components/schemas/OrderEvent" }),
          },
        },
        "/orders/{id}/fields": {
          get: {
            operationId: "watchFields",
            tags: ["orders"],
            parameters: [
              orderId,
              {
                name: "fields",
                in: "query",
                style: "form",
                explode: false,
                schema: { type: "array", items: { type: "string" } },
              },
            ],
            responses: events({ $ref: "#/components/schemas/OrderEvent" }),
          },
        },
        ...(!streamsOnly && {
          "/orders/{id}/replay": {
            post: {
              operationId: "replayOrder",
              tags: ["orders"],
              parameters: [orderId],
              responses: events(OrderEvent),
            },
          },
        }),
      },
      components: { schemas: { OrderEvent } },
    }),
  );
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["types-only", { generateSchemas: false }],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  const stream =
    'data: {"status":"paid"}\n\ndata: {"status":"shipped"}\n\nevent: courier:complete\ndata: \n\n';
  upstream = await startUpstreamServer([], {
    "/v1/orders/o1/events": { contentType: "text/event-stream", body: stream },
    "/v1/orders/o1/fields": { contentType: "text/event-stream", body: stream },
  });
});

afterAll(async () => {
  await upstream.close();
  removeProjects("event-streams");
});

function generate(options: Partial<GenerateOptions>, streamsOnly = false) {
  return generateCode(
    spec(upstream.origin, streamsOnly),
    { type: "openapi", outputDir: "src/api", ...options },
    "shop",
  );
}

function groupFile(options: Partial<GenerateOptions>, streamsOnly = false): string {
  return (
    generate(options, streamsOnly).find((file) => file.path.endsWith("orders/index.ts"))?.content ??
    ""
  );
}

async function received(subscription: unknown): Promise<unknown[]> {
  const got: unknown[] = [];
  for await (const event of (await subscription) as AsyncIterable<{ data: unknown }>)
    got.push(event.data);
  return got;
}

describe("the generated file", () => {
  it("builds the GET stream with stream, and keeps the POST one an endpoint", () => {
    const file = groupFile({});

    expect(file).toContain("const { endpoint, stream } = courier();");
    expect(file).toMatch(/watchOrder: stream\.get\(":id\/events"\)/);
    expect(file).toMatch(/replayOrder: endpoint\.post\(/);
    expect(file).toMatch(
      /watchFields: stream\.variables<.*>\(\)\.via\(\(sse, vars\) => sse\.get\(":id\/fields", formQuery\(/,
    );
  });

  it("takes only stream from courier() when every definition is a stream", () => {
    const file = groupFile({}, true);

    expect(file).toContain("const { stream } = courier();");
    expect(file).toMatch(/watchOrder: stream\.get/);
  });

  it("compiles when every definition is a stream", () => {
    const dir = writeProject("event-streams/streams-only", generate({}, true));
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/shop/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it("subscribes to the stream and gets each event", async () => {
    const { shopApi } = loadGenerated(generate(options), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    const got = await received(
      endpointAt(shopApi, "orders", "watchOrder")({ id: "o1", since: "2026" }),
    );

    expect(got).toEqual([{ status: "paid" }, { status: "shipped" }]);
    expect(upstream.requests[0]?.path).toBe("/v1/orders/o1/events");
    expect(upstream.requests[0]?.query).toContainEqual(["since", "2026"]);
  });

  it("writes the query in the style its parameters declare", async () => {
    const { shopApi } = loadGenerated(generate(options), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await received(endpointAt(shopApi, "orders", "watchFields")({ id: "o1", fields: ["a", "b"] }));

    expect(upstream.requests[0]?.path).toBe("/v1/orders/o1/fields");
    expect(upstream.requests[0]?.query).toEqual([["fields", "a,b"]]);
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject(`event-streams/${label}`, generate(options));
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/shop/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("through the proxy", () => {
  let proxy: ProxyServer;
  let source: Record<string, unknown> | undefined;

  beforeAll(async () => {
    const loaded = loadGenerated(generate({}), "src/api/shop/source.ts");
    const shop = loaded.shop;
    if (isRecord(shop)) source = shop;
    proxy = await startProxyServer(loaded);
  });

  afterAll(async () => {
    await proxy.close();
  });

  /* The proxy opens a stream the API serves and relays it, as it forwards
     the API's other endpoints. */
  it("reaches the API's stream, relayed event by event", async () => {
    const caller = createProxyCaller("shop", {
      source,
      proxyPath: { http: proxy.url, sse: proxy.url },
    });
    upstream.requests.length = 0;

    const got = await received(
      endpointAt(caller, "orders", "watchOrder")({ id: "o1", since: "2026" }),
    );

    expect(got).toEqual([{ status: "paid" }, { status: "shipped" }]);
    expect(upstream.requests[0]?.path).toBe("/v1/orders/o1/events");
    expect(upstream.requests[0]?.query).toContainEqual(["since", "2026"]);
  });

  it("writes the query in the style its parameters declare, relayed", async () => {
    const caller = createProxyCaller("shop", {
      source,
      proxyPath: { http: proxy.url, sse: proxy.url },
    });
    upstream.requests.length = 0;

    await received(endpointAt(caller, "orders", "watchFields")({ id: "o1", fields: ["a", "b"] }));

    expect(upstream.requests[0]?.query).toEqual([["fields", "a,b"]]);
  });

  /* The generated proxy caller takes the source's routes from the routes module, which
     is what tells it which endpoints are streams. */
  it("reaches the API's stream through the routes the generated proxy caller takes", async () => {
    const files = generate({ generateClient: "both" });
    const { shopRoutes } = loadGenerated(
      [...files, ...routesFiles(files, "shop")],
      "courier.routes.ts",
    );
    if (!isRecord(shopRoutes)) throw new Error("courier.routes.ts exports no routes");
    const caller = createProxyCaller(shopRoutes as unknown as CourierRoutes, {
      proxyPath: { http: proxy.url, sse: proxy.url },
    });
    upstream.requests.length = 0;

    const got = await received(endpointAt(caller, "orders", "watchOrder")({ id: "o1" }));

    expect(got).toEqual([{ status: "paid" }, { status: "shipped" }]);
    expect(shopRoutes.endpoints).toEqual({
      "orders.listOrders": { type: "query" },
      "orders.replayOrder": { type: "mutation" },
      "orders.watchFields": { transport: "sse" },
      "orders.watchOrder": { transport: "sse" },
    });
  });

  it("gives the generated proxy caller those routes, and compiles with every check on", () => {
    const files = generate({ generateClient: "proxy" });
    const proxyFile = files.find((file) => file.path === "src/api/shop/proxy.ts")?.content ?? "";
    const dir = writeProject("event-streams/proxy", [...files, ...routesFiles(files, "shop")]);
    const strictest = { ...STRICT, noUnusedLocals: true, verbatimModuleSyntax: true };

    expect(proxyFile).toContain('import { shopRoutes } from "../../../courier.routes";');
    expect(proxyFile).toContain("export const shopProxyApi = createProxyCaller(shopRoutes);");
    expect(compileProject(dir, ["src/api/shop/proxy.ts"], strictest)).toEqual([]);
  }, 60_000);

  it("says so in the generated comment", () => {
    expect(groupFile({})).toContain(
      "A stream the API serves: a direct caller opens it, and the proxy relays it",
    );
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
