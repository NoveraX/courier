/**
 * A generated client sends a url-encoded body url-encoded, as Stripe and
 * Twilio take every write, and reads an answer that is not JSON — a CSV, a
 * PDF — as what it is: text or a blob. Both used to fail: the fields went as
 * JSON, and the answer failed to parse as JSON. Directly and through the
 * proxy, whichever validator the client was generated with.
 */
import { createProxyCaller } from "@noverax/courier";
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
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { type ProxyServer, startProxyServer } from "../helpers/proxy-server";
import { type UpstreamServer, startUpstreamServer } from "../helpers/upstream-server";

const FORM = "application/x-www-form-urlencoded";
const customerId = { name: "id", in: "path", required: true, schema: { type: "string" } };
const expand = { name: "expand", in: "query", schema: { type: "string" } };
const month = { name: "month", in: "path", required: true, schema: { type: "string" } };

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Billing", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        "/customers/{id}": {
          post: {
            operationId: "updateCustomer",
            tags: ["customers"],
            parameters: [customerId, expand],
            requestBody: {
              content: {
                [FORM]: {
                  schema: {
                    type: "object",
                    properties: {
                      email: { type: "string" },
                      metadata: { type: "object", additionalProperties: { type: "string" } },
                      tags: { type: "array", items: { type: "string" } },
                    },
                  },
                  encoding: { metadata: { style: "deepObject", explode: true } },
                },
              },
            },
            responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } },
          },
        },
        "/reports/{month}": {
          get: {
            operationId: "exportReport",
            tags: ["customers"],
            parameters: [month],
            responses: { "200": { description: "csv", content: { "text/csv": {} } } },
          },
        },
        "/invoices/{month}/pdf": {
          post: {
            operationId: "renderInvoice",
            tags: ["customers"],
            parameters: [month, expand],
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { copies: { type: "integer" } } },
                },
              },
            },
            responses: {
              "200": {
                description: "pdf",
                content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
              },
            },
          },
        },
      },
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
  upstream = await startUpstreamServer(
    { id: "cus_1" },
    {
      "/v1/reports/2026-01": { contentType: "text/csv", body: "id,total\n1,20\n" },
      "/v1/invoices/2026-01/pdf": { contentType: "application/pdf", body: "%PDF-1.7" },
    },
  );
});

afterAll(async () => {
  await upstream.close();
  removeProjects("form-and-answers");
});

function generate(options: Partial<GenerateOptions>) {
  return generateCode(spec(upstream.origin), { type: "openapi", outputDir: "src/api", ...options }, "billing");
}

const UPDATE = { id: "cus_1", expand: "invoices", email: "ada@example.com", metadata: { plan: "pro" }, tags: ["a", "b"] };

async function exercise(caller: unknown): Promise<void> {
  upstream.requests.length = 0;

  await endpointAt(caller, "customers", "updateCustomer")(UPDATE);
  const csv = await endpointAt(caller, "customers", "exportReport")({ month: "2026-01" });
  const pdf = await endpointAt(caller, "customers", "renderInvoice")({ month: "2026-01", copies: 2 });

  const [update, report, invoice] = upstream.requests;
  expect(update?.path).toBe("/v1/customers/cus_1");
  expect(update?.query).toEqual([["expand", "invoices"]]);
  expect(update?.contentType).toMatch(/^application\/x-www-form-urlencoded/);
  expect(decodeURIComponent(update?.body ?? "")).toBe("email=ada@example.com&metadata[plan]=pro&tags=a&tags=b");
  expect(report?.path).toBe("/v1/reports/2026-01");
  expect(invoice?.body).toBe('{"copies":2}');
  expect(csv).toBe("id,total\n1,20\n");
  expect(pdf).toBeInstanceOf(Blob);
  expect(await (pdf as Blob).text()).toBe("%PDF-1.7");
}

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it("sends url-encoded fields as a form, and reads text and binary answers as what they are", async () => {
    const { billingApi } = loadGenerated(generate(options), "src/api/billing/index.ts");

    await exercise(billingApi);
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject(`form-and-answers/${label}`, generate(options));
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/billing/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("through the proxy", () => {
  let proxy: ProxyServer;

  beforeAll(async () => {
    proxy = await startProxyServer(loadGenerated(generate({}), "src/api/billing/source.ts"));
  });

  afterAll(async () => {
    await proxy.close();
  });

  it("sends the form and reads the answers the same way", async () => {
    await exercise(createProxyCaller("billing", { proxyPath: { http: proxy.url } }));
  });
});
