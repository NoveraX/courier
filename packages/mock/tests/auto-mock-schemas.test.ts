import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineApi, defineGroup, courier } from "@noverax/courier/define";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { generateRecords } from "../src/auto/data-generator";
import { extractPaginatedItemSchema } from "../src/auto/schema-introspect";

const { endpoint } = courier();

// ── Schema edge cases (unit tests) ──────────────────────────────────────────

describe("extractPaginatedItemSchema", () => {
  it("extracts items from standard wrapper regardless of field name", () => {
    const schema = z.object({
      pets: z.array(z.object({ id: z.string() })),
      total: z.number(),
    });
    const item = extractPaginatedItemSchema(schema);
    expect(item).toBeDefined();
  });

  it("returns undefined for ambiguous schemas (2+ array<object>)", () => {
    const schema = z.object({
      items: z.array(z.object({ id: z.string() })),
      errors: z.array(z.object({ code: z.number() })),
    });
    expect(extractPaginatedItemSchema(schema)).toBeUndefined();
  });

  it("ignores array<primitive> when counting", () => {
    const schema = z.object({
      items: z.array(z.object({ id: z.string() })),
      tags: z.array(z.string()),
    });
    expect(extractPaginatedItemSchema(schema)).toBeDefined();
  });

  it("returns undefined for flat object (no arrays)", () => {
    expect(extractPaginatedItemSchema(z.object({ id: z.string() }))).toBeUndefined();
  });

  it("returns undefined for direct array", () => {
    expect(extractPaginatedItemSchema(z.array(z.object({ id: z.string() })))).toBeUndefined();
  });
});

describe("generateRecords edge cases", () => {
  it("generates nullable fields", () => {
    const schema = z.object({ name: z.string(), bio: z.string().nullable() });
    const [record] = generateRecords(schema, 1);
    expect(record).toHaveProperty("bio");
  });

  it("generates non-discriminated union (picks variant)", () => {
    const schema = z.object({ value: z.union([z.string(), z.number()]) });
    const [record] = generateRecords(schema, 1);
    expect(["string", "number"]).toContain(typeof record!.value);
  });

  it("handles self-referencing schema without infinite recursion", () => {
    interface TreeNode {
      id: string;
      children: TreeNode[];
    }
    const TreeSchema: z.ZodType<TreeNode> = z.object({
      id: z.string(),
      children: z.lazy(() => z.array(TreeSchema)),
    });
    // Should not hang or throw
    const [record] = generateRecords(TreeSchema, 1);
    expect(record).toHaveProperty("id");
    expect(Array.isArray(record!.children)).toBe(true);
  });

  it("generates z.string().default() correctly", () => {
    const schema = z.object({ role: z.string().default("viewer") });
    const [record] = generateRecords(schema, 1);
    expect(record!.role).toBe("viewer");
  });

  it("generates z.literal() correctly", () => {
    const schema = z.object({
      version: z.literal(3),
      kind: z.literal("document"),
    });
    const [record] = generateRecords(schema, 1);
    expect(record!.version).toBe(3);
    expect(record!.kind).toBe("document");
  });

  it("generates discriminated union with all variants across records", () => {
    const schema = z.object({
      event: z.discriminatedUnion("type", [
        z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
        z.object({ type: z.literal("scroll"), offset: z.number() }),
      ]),
    });
    const records = generateRecords(schema, 10);
    const types = new Set(records.map((r) => (r.event as Record<string, unknown>).type));
    expect(types.size).toBe(2);
  });

  it("generates record<string, object> with sample keys", () => {
    const schema = z.object({
      translations: z.record(z.string(), z.object({ title: z.string() })),
    });
    const [record] = generateRecords(schema, 1);
    const translations = record!.translations as Record<string, unknown>;
    expect(Object.keys(translations).length).toBeGreaterThan(0);
    const firstValue = Object.values(translations)[0] as Record<string, unknown>;
    expect(firstValue).toHaveProperty("title");
  });

  it("generates tuple with correct element types", () => {
    const schema = z.object({
      range: z.tuple([z.number(), z.number()]),
      pair: z.tuple([z.string(), z.boolean()]),
    });
    const [record] = generateRecords(schema, 1);
    const range = record!.range as number[];
    expect(range).toHaveLength(2);
    expect(typeof range[0]).toBe("number");
    const pair = record!.pair as [string, boolean];
    expect(typeof pair[0]).toBe("string");
    expect(typeof pair[1]).toBe("boolean");
  });

  it("generates fallback records when no schema shape available", () => {
    const records = generateRecords(z.unknown(), 3);
    expect(records).toHaveLength(3);
    expect(records[0]).toHaveProperty("id");
  });
});

// ── Integration: schemaless endpoints + pagination wrapper routing ───────────

describe("auto-mock with mixed schema endpoints", () => {
  const WrapperSchema = z.object({
    results: z.array(z.object({ id: z.string(), title: z.string() })),
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

  const mixedApi = defineApi({
    baseURL: "https://test.api",
    groups: {
      // Group with ONLY a wrapper endpoint (no direct array)
      feed: defineGroup({
        prefix: "/feed",
        endpoints: {
          paginated: endpoint.response(WrapperSchema).get(""),
        },
      }),
      // Group with no schema at all
      legacy: defineGroup({
        prefix: "/legacy",
        endpoints: {
          list: endpoint.get(""),
          getById: endpoint.get(":id"),
        },
      }),
    },
  });

  const server = createAutoMockServer({
    source: mixedApi,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 5 },
  });

  let url: string;

  beforeAll(async () => {
    const info = await server.start();
    url = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("seeds from pagination wrapper (extracts item schema)", async () => {
    const body = await fetch(`${url}/feed`).then((r) => r.json());
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(5);
    // Should be item objects, not wrapper objects
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("title");
    expect(body[0]).not.toHaveProperty("cursor");
  });

  it("seeds schemaless endpoints with fallback data", async () => {
    const body = await fetch(`${url}/legacy`).then((r) => r.json());
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(5);
    expect(body[0]).toHaveProperty("id");
  });
});
