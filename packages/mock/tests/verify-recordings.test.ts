/**
 * Recorded calls checked against the definition as it is now: a call that
 * still fits has no problems; an endpoint removed, a method or a route
 * changed, variables or an answer a schema now refuses are each named —
 * while a value replaced as a secret, a part recorded only in part, and an
 * answer a reshaping schema refuses are not counted against the definition.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { Fixture } from "../src/record/fixture";
import { fixturesToHar } from "../src/record/fixture";
import { readRecordings } from "../src/record/read-recordings";
import { reshapes } from "../src/verify/schema-check";
import { verifyRecordings } from "../src/verify/verify-recordings";

const { endpoint } = courier();

const Product = z.object({ id: z.string(), price: z.number(), status: z.enum(["live", "draft"]) });

function shop(overrides: Record<string, unknown> = {}) {
  return defineApi({
    baseURL: "https://shop.example/api",
    groups: {
      products: defineGroup({
        prefix: "products",
        endpoints: {
          get: endpoint
            .get(":id")
            .variables(z.object({ id: z.string() }))
            .response(Product),
          create: endpoint
            .post("")
            .variables(z.object({ name: z.string() }))
            .response(Product),
          ...overrides,
        },
      }),
    },
  });
}

function recording(fields: Partial<Fixture> = {}): Fixture {
  return {
    group: "products",
    method: "get",
    variables: { id: "p_1" },
    request: { method: "GET", url: "https://shop.example/api/products/p_1" },
    response: { status: 200, data: { id: "p_1", price: 12, status: "live" }, headers: {} },
    duration: 40,
    recordedAt: "2026-10-09T01:00:00.000Z",
    ...fields,
  };
}

describe("a recorded call checked against the definition", () => {
  it("fits while nothing changed, recorded against another host and base path too", async () => {
    const [same, elsewhere] = await verifyRecordings(shop(), [
      recording(),
      recording({ request: { method: "GET", url: "http://localhost:7101/products/p_1" } }),
    ]);

    expect(same).toMatchObject({
      at: 1,
      endpoint: "products.get",
      label: "products.get · GET /api/products/p_1 → 200",
      problems: [],
      unchecked: [],
    });
    expect(elsewhere?.problems).toEqual([]);
  });

  it("checks a call made with no variables as the client does: as an empty object where the schema refuses none", async () => {
    const lists = shop({
      list: endpoint.get("").variables(z.object({ page: z.number().optional() })),
      search: endpoint.get("search").variables(z.object({ q: z.string() })),
    });
    const none = (method: string, path: string) =>
      recording({
        method,
        variables: undefined,
        request: { method: "GET", url: `https://shop.example/api/products${path}` },
        response: { status: 200, headers: {}, data: [] },
      });

    const [list, search] = await verifyRecordings(lists, [
      none("list", ""),
      none("search", "/search"),
    ]);

    expect(list?.problems).toEqual([]);
    expect(search?.problems.map((problem) => problem.issues?.[0]?.path)).toEqual(["q"]);
  });

  it("names an endpoint removed, a method changed and a route changed", async () => {
    const changed = shop({
      get: endpoint
        .get("items/:id")
        .variables(z.object({ id: z.string() }))
        .response(Product),
      create: endpoint
        .put("")
        .variables(z.object({ name: z.string() }))
        .response(Product),
    });
    const created = recording({
      method: "create",
      variables: { name: "Lamp" },
      request: { method: "POST", url: "https://shop.example/api/products" },
    });

    const checks = await verifyRecordings(changed, [
      recording(),
      created,
      recording({ method: "archive" }),
    ]);

    expect(checks.map((check) => check.problems.map((problem) => problem.kind))).toEqual([
      ["path-changed"],
      ["method-changed"],
      ["endpoint-removed"],
    ]);
    expect(checks[0]?.problems[0]?.message).toBe(
      "recorded at /api/products/p_1, but the endpoint now sends to /products/items/:id",
    );
    expect(checks[2]?.problems[0]?.message).toBe("products.archive is no longer defined");
  });

  it("fits a call recorded where a doubled colon sends one beside a parameter, and no other", async () => {
    const methods = shop({
      archive: endpoint.post(":id::archive").variables(z.object({ id: z.string() })),
    });
    const archived = (url: string) =>
      recording({
        method: "archive",
        request: { method: "POST", url },
        response: { status: 200, data: {}, headers: {} },
      });

    const [fits, other] = await verifyRecordings(methods, [
      archived("https://shop.example/api/products/p_1:archive"),
      archived("https://shop.example/api/products/p_1:restore"),
    ]);

    expect(fits?.problems).toEqual([]);
    expect(other?.problems.map((problem) => problem.kind)).toEqual(["path-changed"]);
  });

  it("names the variables and the answer a schema now refuses, with each place", async () => {
    const stricter = shop({
      get: endpoint
        .get(":id")
        .variables(z.object({ id: z.string(), locale: z.string() }))
        .response(Product.extend({ status: z.enum(["live"]) })),
    });

    const [check] = await verifyRecordings(stricter, [
      recording({
        response: { status: 200, headers: {}, data: { id: "p_1", price: 1, status: "draft" } },
      }),
    ]);

    expect(check?.problems).toEqual([
      {
        kind: "variables-refused",
        message: "the recorded variables no longer pass the endpoint's variables schema",
        issues: [{ path: "locale", message: expect.any(String) }],
      },
      {
        kind: "answer-refused",
        message: "the recorded answer no longer passes the endpoint's response schema",
        issues: [{ path: "status", message: expect.any(String) }],
      },
    ]);
  });

  it("leaves an error answer, a replaced secret and a part recorded in part alone", async () => {
    const withSession = shop({
      get: endpoint
        .get(":id")
        .variables(z.object({ id: z.string() }))
        .response(Product.extend({ sessionId: z.uuid() })),
    });
    const notFound = recording({ response: { status: 404, headers: {}, data: { error: "gone" } } });
    const redacted = recording({
      response: {
        status: 200,
        headers: {},
        data: { id: "p", price: 1, status: "live", sessionId: "[redacted]" },
      },
      redacted: ["response.sessionId"],
    });
    const partial = recording({
      response: { status: 200, headers: {}, data: { id: "p", items: "… 400 more items" } },
      partial: ["response"],
    });

    const checks = await verifyRecordings(withSession, [notFound, redacted, partial]);

    expect(checks.map((check) => check.problems)).toEqual([[], [], []]);
    expect(checks[2]?.unchecked).toEqual(["the answer, recorded only in part"]);
  });

  it("says when a refusal may be a reshaping schema's, rather than a change", async () => {
    const reshaping = shop({
      get: endpoint
        .get(":id")
        .variables(z.object({ id: z.string() }))
        .response(z.object({ id: z.string(), price: z.string().transform(Number) })),
    });

    const [check] = await verifyRecordings(reshaping, [
      recording({ response: { status: 200, headers: {}, data: { id: "p_1", price: 12 } } }),
    ]);

    expect(check?.problems).toEqual([]);
    expect(check?.unchecked).toEqual([
      "the answer, refused at price by a response schema that reshapes what it reads: the reshaping may be all that differs",
    ]);
  });

  it("finds each recording in its source, and names a source no longer defined", async () => {
    const payments = defineApi({
      baseURL: "https://pay.example",
      endpoints: { refund: endpoint.post("refunds").variables(z.object({ id: z.string() })) },
    });
    const refund = recording({
      source: "payments",
      group: "",
      method: "refund",
      variables: { id: "c_1" },
      request: { method: "POST", url: "https://pay.example/refunds" },
      response: { status: 201, headers: {}, data: {} },
    });

    const checks = await verifyRecordings({ shop: shop(), payments }, [
      recording({ source: "shop" }),
      refund,
      recording({ source: "billing" }),
    ]);

    expect(checks.map((check) => [check.source, check.problems.map((p) => p.message)])).toEqual([
      ["shop", []],
      ["payments", []],
      ["billing", ["the source billing is no longer defined"]],
    ]);
    expect(checks[1]?.label).toBe("payments refund · POST /refunds → 201");
  });

  it("leaves the endpoints an ignore list names unchecked", async () => {
    const without = shop({ get: undefined });

    const checks = await verifyRecordings(without, [recording(), recording()], {
      ignore: ["products.*"],
    });

    expect(checks.map((check) => [check.problems, check.unchecked])).toEqual([
      [[], ["left unchecked by the ignore list"]],
      [[], ["left unchecked by the ignore list"]],
    ]);
  });
});

describe("a schema that reshapes what it reads", () => {
  it("is one that transforms or pipes into another type, not one with defaults or optional fields", () => {
    expect([
      reshapes(z.object({ price: z.string().transform(Number) })),
      reshapes(z.object({ n: z.string().pipe(z.coerce.number()) })),
      reshapes(z.object({ id: z.string().default("x"), note: z.string().optional() })),
      reshapes(z.object({ at: z.coerce.date() })),
    ]).toEqual([true, true, false, false]);
  });
});

describe("reading recordings for a test", () => {
  const dir = mkdtempSync(join(tmpdir(), "courier-recordings-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads back the source, the replaced places and the parts kept in part", () => {
    const file = join(dir, "checkout.har");
    const recorded = recording({
      source: "shop",
      redacted: ["variables.password"],
      partial: ["response"],
    });
    writeFileSync(file, JSON.stringify(fixturesToHar([recorded])));

    const [read] = readRecordings(pathToFileURL(file));

    expect(read).toMatchObject({
      source: "shop",
      redacted: ["variables.password"],
      partial: ["response"],
    });
  });

  it("refuses a file that does not exist, rather than reading none", () => {
    expect(() => readRecordings(join(dir, "missing.har"))).toThrow(
      expect.objectContaining({ code: "FIXTURES_MISSING" }),
    );
  });
});
