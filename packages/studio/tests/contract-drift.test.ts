/**
 * The contract's drift, from real answers: each endpoint with a response
 * schema is confirmed by its traffic, drifted from its schema, or not yet
 * observed. A field the schema does not name — the outermost only — a type
 * it does not take, and a required field some answers lack are each named,
 * with when, how often and from where, and the fields the schema should
 * declare; a record's keys and an object that takes unnamed keys are no
 * drift. What was seen survives a restart, and can be forgotten.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { courier, defineApi } from "@noverax/courier/define";
import { answerShapeOf, standardJsonSchema } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAnswerObserver } from "../src/server/contract-drift/answer-observer";
import { contractReport } from "../src/server/contract-drift/contract-report";
import { declaredShapeOf } from "../src/server/contract-drift/declared-shape";
import { endpointDrift } from "../src/server/contract-drift/endpoint-drift";
import { schemaFix } from "../src/server/contract-drift/schema-fix";
import { createStudioServer } from "../src/server/create-studio-server";
import { createAnswerObservations } from "../src/server/storage/answer-observations";
import { migrate } from "../src/server/storage/migrate";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";

const { endpoint } = courier();

const Product = z.object({
  id: z.string(),
  price: z.number(),
  seller: z.object({ name: z.string() }),
  tags: z.array(z.string()),
  prices: z.record(z.string(), z.number()),
  extra: z.looseObject({ kind: z.string() }),
  note: z.string().nullable().optional(),
});

function declared(schema: z.ZodType) {
  return declaredShapeOf(standardJsonSchema(schema, "input"));
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

const fits = {
  id: "p_1",
  price: 12,
  seller: { name: "Ada" },
  tags: ["lamp"],
  prices: { eur: 11, usd: 12 },
  extra: { kind: "a", anything: true },
};

const { seller: _seller, ...withoutSeller } = fits;

describe("what a response schema declares", () => {
  it("reads each place: types, required fields, records and objects that take unnamed keys", () => {
    const shape = declared(Product);

    expect(shape.places.get("id")).toMatchObject({ types: new Set(["string"]), required: true });
    expect(shape.places.get("note")).toMatchObject({
      types: new Set(["string", "null"]),
      required: false,
    });
    expect(shape.places.get("tags[]")?.types).toEqual(new Set(["string"]));
    expect(shape.maps.has("prices")).toBe(true);
    expect(shape.places.get("prices.*")?.types).toEqual(new Set(["number"]));
    expect(shape.places.get("extra")?.open).toBe(true);
  });
});

describe("an endpoint's drift", () => {
  function driftOf(answers: unknown[]) {
    const db = database();
    const seen = createAnswerObservations(db);
    for (const answer of answers) {
      seen.observe({
        source: "shop",
        endpoint: "products.get",
        ...answerShapeOf(answer),
        place: "api.example.com",
        at: 1000,
      });
    }
    return endpointDrift(seen.of("shop", "products.get"), declared(Product));
  }

  it("is confirmed while every answer fits, a record's keys and an open object's extras included", () => {
    expect(driftOf([fits, { ...fits, note: null }])).toEqual({ state: "confirmed", drift: [] });
    expect(endpointDrift(undefined, declared(Product))).toEqual({ state: "unobserved", drift: [] });
  });

  it("names an object missing when some answers lack it, and not the fields that went with it", () => {
    const { drift } = driftOf([fits, withoutSeller, { ...fits, seller: {} }]);

    expect(drift.filter((difference) => difference.kind === "missing")).toEqual([
      expect.objectContaining({ path: "seller", count: 1 }),
      expect.objectContaining({ path: "seller.name", count: 1 }),
    ]);
  });

  it("names a field the schema does not name — the outermost only — a type it does not take, and a field some answers lack", () => {
    const { state, drift } = driftOf([
      { ...fits, rating: { stars: 4 }, price: "12.00", seller: { name: "Ada", verified: true } },
      withoutSeller,
    ]);

    expect(state).toBe("drifted");
    expect(
      drift.map(({ path, kind, observed, declared: types, count }) => ({
        path,
        kind,
        observed,
        types,
        count,
      })),
    ).toEqual(
      expect.arrayContaining([
        { path: "rating", kind: "undeclared", observed: ["object"], types: undefined, count: 1 },
        { path: "price", kind: "type", observed: ["string"], types: ["number"], count: 1 },
        {
          path: "seller.verified",
          kind: "undeclared",
          observed: ["boolean"],
          types: undefined,
          count: 1,
        },
        { path: "seller", kind: "missing", observed: ["object"], types: undefined, count: 1 },
      ]),
    );
    expect(drift.some((difference) => difference.path === "rating.stars")).toBe(false);
    expect(drift.find((difference) => difference.path === "rating")?.places).toEqual([
      "api.example.com",
    ]);
  });
});

describe("the contract report", () => {
  const shop = defineApi({
    baseURL: "https://shop.example",
    endpoints: {
      product: endpoint.get("products/:id").response(Product),
      cart: endpoint.get("cart").response(z.object({ items: z.array(z.string()) })),
      untyped: endpoint.get("untyped"),
    },
  });

  it("follows the runtime's events to each endpoint, and says what its schema should declare", () => {
    const seen = createAnswerObservations(database());
    const observer = createAnswerObserver(seen, () => 5000);
    const events = [
      { type: "request:start", id: "r1", source: "shop", method: "product" },
      { type: "http:fetch:start", requestId: "r1", url: "https://api.example.com/products/p_1" },
      { type: "request:shape", requestId: "r1", ...answerShapeOf({ ...fits, rating: 4 }) },
      { type: "request:end", requestId: "r1", id: "r1" },
    ];

    const consumed = events.map((event) => observer.see(event));
    const report = contractReport({ shop }, seen);

    expect(consumed).toEqual([false, false, true, false]);
    expect(report.map(({ endpoint: id, state }) => [id, state])).toEqual([
      ["product", "drifted"],
      ["cart", "unobserved"],
    ]);
    expect(report[0]?.fix).toEqual([{ within: "", line: "rating: z.number()" }]);
  });

  it("keeps what was seen across a restart, and forgets an endpoint when asked", () => {
    const db = database();
    const first = createAnswerObservations(db);
    first.observe({
      source: "shop",
      endpoint: "product",
      ...answerShapeOf(fits),
      place: undefined,
      at: 1,
    });
    first.close();

    const again = createAnswerObservations(db);
    const kept = again.of("shop", "product");
    again.forget("shop", "product");

    expect(kept).toMatchObject({ calls: 1, cut: 0 });
    expect(kept?.fields.find((field) => field.path === "seller.name")).toMatchObject({
      type: "string",
      count: 1,
    });
    expect(createAnswerObservations(db).of("shop", "product")).toBeUndefined();
  });
});

describe("the contract routes", () => {
  it("report every endpoint with a response schema, and forget one only with the token", async () => {
    const root = mkdtempSync(join(tmpdir(), "courier-contract-"));
    symlinkSync(
      resolve(import.meta.dirname, "../../../node_modules"),
      join(root, "node_modules"),
      "dir",
    );
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shop", type: "module" }));
    writeFileSync(
      join(root, "courier.config.ts"),
      `import { courier, defineApi } from "@noverax/courier/define";
       import { z } from "zod";
       const { endpoint } = courier();
       export default { sources: { shop: defineApi({ baseURL: "https://shop.example", endpoints: { product: endpoint.get("p").response(z.object({ id: z.string() })) } }) } };`,
    );
    let studio: StudioServer | undefined;
    const url = await new Promise<string>((done, fail) => {
      studio = createStudioServer({
        port: 0,
        host: "127.0.0.1",
        projectRoot: root,
        onReady: done,
        onError: fail,
      });
    });
    const post = (path: string, body: unknown, token?: string) =>
      fetch(`${url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token && { [TOKEN_HEADER]: token }) },
        body: JSON.stringify(body),
      });
    try {
      const report = await (await post("/api/contract/report", {})).json();
      const refused = await post("/api/contract/forget", { source: "shop", endpoint: "product" });
      const forgotten = await post(
        "/api/contract/forget",
        { source: "shop", endpoint: "product" },
        studio?.token,
      );

      expect(report.endpoints).toEqual([
        expect.objectContaining({
          source: "shop",
          endpoint: "product",
          state: "unobserved",
          calls: 0,
        }),
      ]);
      expect([refused.status, forgotten.status]).toEqual([401, 200]);
    } finally {
      await studio?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the fields a schema should declare", () => {
  const at = { firstSeen: 1, lastSeen: 2, places: [] };

  it("takes each field as it came: its type, optional when not every answer held it, nullable when it came as null", () => {
    expect(
      schemaFix(
        [
          { ...at, path: "rating", kind: "undeclared", observed: ["number"], count: 3 },
          {
            ...at,
            path: "seller.note",
            kind: "undeclared",
            observed: ["null", "string"],
            count: 10,
          },
          {
            ...at,
            path: "stock",
            kind: "type",
            observed: ["number"],
            declared: ["string"],
            alsoFits: false,
            count: 10,
          },
          {
            ...at,
            path: "price",
            kind: "type",
            observed: ["string"],
            declared: ["number"],
            alsoFits: true,
            count: 2,
          },
          { ...at, path: "seller", kind: "missing", observed: ["object"], count: 1 },
        ],
        10,
        "zod",
      ),
    ).toEqual([
      { within: "", line: "rating: z.number().optional()" },
      { within: "seller", line: "note: z.string().nullable()" },
      { within: "", line: "stock: z.number()" },
      { within: "", line: "price: z.union([z.number(), z.string()])" },
      { within: "", line: "seller: ….optional()" },
    ]);
  });

  it("writes the JSON types for a schema that is not Zod's", () => {
    expect(
      schemaFix(
        [{ ...at, path: "rating", kind: "undeclared", observed: ["number"], count: 1 }],
        2,
        "valibot",
      ),
    ).toEqual([{ within: "", line: "rating: number, optional" }]);
  });
});
