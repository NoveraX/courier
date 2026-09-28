import { describe, expect, it } from "vitest";
import { z } from "zod";

import { generateRecord, generateRecords } from "../src/auto/data-generator";
import { detectEntityContext, generateBoolean, generateFallbackRecords } from "../src/auto/data-generator/context";
import { generateValue } from "../src/auto/data-generator/value";
import { generateString, generateDateString } from "../src/auto/gen-string";
import { generateNumber } from "../src/auto/gen-number";
import { pseudoRandom, roundTo, formatKeyAsLabel, deterministicHex, pick } from "../src/auto/gen-helpers";
import { analyzeField, extractShape, unwrapArraySchema } from "../src/auto/schema-introspect";

// ── gen-helpers ──────────────────────────────────────────────────────────────

describe("gen-helpers", () => {
  describe("pseudoRandom", () => {
    it("returns deterministic value for same seed", () => {
      expect(pseudoRandom(1)).toBe(pseudoRandom(1));
      expect(pseudoRandom(42)).toBe(pseudoRandom(42));
    });

    it("returns value between 0 and 1", () => {
      for (let i = 0; i < 50; i++) {
        const val = pseudoRandom(i);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it("produces different values for different seeds", () => {
      const values = new Set(Array.from({ length: 20 }, (_, i) => pseudoRandom(i)));
      expect(values.size).toBeGreaterThan(15);
    });
  });

  describe("roundTo", () => {
    it("rounds to specified decimal places", () => {
      expect(roundTo(3.14159, 2)).toBe(3.14);
      expect(roundTo(3.14159, 0)).toBe(3);
      expect(roundTo(3.145, 2)).toBe(3.15);
    });
  });

  describe("formatKeyAsLabel", () => {
    it("converts camelCase to label", () => {
      expect(formatKeyAsLabel("firstName")).toBe("First Name");
    });

    it("converts snake_case to label", () => {
      expect(formatKeyAsLabel("first_name")).toBe("First name");
    });

    it("handles simple key", () => {
      expect(formatKeyAsLabel("name")).toBe("Name");
    });
  });

  describe("deterministicHex", () => {
    it("returns string of specified length", () => {
      expect(deterministicHex(1, 8)).toHaveLength(8);
      expect(deterministicHex(1, 32)).toHaveLength(32);
    });

    it("is deterministic", () => {
      expect(deterministicHex(42, 16)).toBe(deterministicHex(42, 16));
    });

    it("contains only hex characters", () => {
      expect(deterministicHex(1, 32)).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("pick", () => {
    const arr = ["a", "b", "c"] as const;

    it("cycles through array", () => {
      expect(pick(arr, 0, "x")).toBe("a");
      expect(pick(arr, 1, "x")).toBe("b");
      expect(pick(arr, 3, "x")).toBe("a");
    });

    it("returns fallback for empty array", () => {
      expect(pick([], 0, "fallback")).toBe("fallback");
    });
  });
});

// ── detectEntityContext ──────────────────────────────────────────────────────

describe("detectEntityContext", () => {
  it("detects product context", () => {
    expect(detectEntityContext(["id", "name", "price", "sku"])).toBe("product");
    expect(detectEntityContext(["title", "category", "amount"])).toBe("product");
  });

  it("detects person context", () => {
    expect(detectEntityContext(["id", "email", "name"])).toBe("person");
    expect(detectEntityContext(["firstName", "lastName", "age"])).toBe("person");
  });

  it("returns generic for ambiguous fields", () => {
    expect(detectEntityContext(["id", "value", "timestamp"])).toBe("generic");
  });
});

// ── generateBoolean ──────────────────────────────────────────────────────────

describe("generateBoolean", () => {
  it("returns boolean", () => {
    expect(typeof generateBoolean("active", 1)).toBe("boolean");
  });

  it("active/enabled fields are mostly true", () => {
    const results = Array.from({ length: 100 }, (_, i) => generateBoolean("isActive", i));
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBeGreaterThan(60);
  });

  it("deleted/archived fields are mostly false", () => {
    const results = Array.from({ length: 100 }, (_, i) => generateBoolean("isDeleted", i));
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBeLessThan(40);
  });
});

// ── generateString ───────────────────────────────────────────────────────────

describe("generateString", () => {
  it("generates id format for id field", () => {
    expect(generateString("id", 1)).toBe("id-1");
    expect(generateString("uuid", 5)).toBe("id-5");
  });

  it("generates email format", () => {
    const email = generateString("email", 1);
    expect(email).toMatch(/@example\.com$/);
  });

  it("generates phone format", () => {
    const phone = generateString("phone", 1);
    expect(phone).toMatch(/^\+1 \(555\)/);
  });

  it("generates URL format", () => {
    const url = generateString("url", 1);
    expect(url).toMatch(/^https:\/\/example\.com/);
  });

  it("generates image URL for image fields", () => {
    const img = generateString("avatar", 1);
    expect(img).toMatch(/^https:\/\/picsum\.photos/);
  });

  it("generates SKU format", () => {
    expect(generateString("sku", 1)).toBe("SKU-00001");
  });

  it("generates date string for date-like fields", () => {
    const date = generateString("createdAt", 1);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("generates token format", () => {
    const token = generateString("token", 1);
    expect(token).toMatch(/^tok_/);
  });

  it("generates password/hash format", () => {
    const pwd = generateString("password", 1);
    expect(pwd).toMatch(/^\$2b\$10\$/);
  });

  it("falls back to formatted label for unknown keys", () => {
    const val = generateString("customField", 3);
    expect(val).toBe("Custom Field 3");
  });

  it("uses product titles when context is product", () => {
    const name = generateString("name", 1, "product");
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  it("uses person names when context is person or generic", () => {
    const name = generateString("name", 1, "person");
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });
});

// ── generateDateString ───────────────────────────────────────────────────────

describe("generateDateString", () => {
  it("returns valid ISO date string", () => {
    const date = generateDateString(1);
    expect(new Date(date).toISOString()).toBe(date);
  });

  it("generates dates within 2025", () => {
    for (let i = 1; i <= 20; i++) {
      const year = new Date(generateDateString(i)).getFullYear();
      expect(year).toBe(2025);
    }
  });

  it("is deterministic", () => {
    expect(generateDateString(5)).toBe(generateDateString(5));
  });
});

// ── generateNumber ───────────────────────────────────────────────────────────

describe("generateNumber", () => {
  const meta = { type: "number" as const };

  it("returns sequential id for id fields", () => {
    expect(generateNumber("id", 1, meta)).toBe(1);
    expect(generateNumber("userId", 5, meta)).toBe(5);
  });

  it("generates price in range", () => {
    const price = generateNumber("price", 1, meta);
    expect(price).toBeGreaterThanOrEqual(9.99);
    expect(price).toBeLessThanOrEqual(300);
  });

  it("generates rating between 1 and 5", () => {
    for (let i = 1; i <= 10; i++) {
      const rating = generateNumber("rating", i, meta);
      expect(rating).toBeGreaterThanOrEqual(1);
      expect(rating).toBeLessThanOrEqual(5);
    }
  });

  it("generates age between 18 and 78", () => {
    for (let i = 1; i <= 20; i++) {
      const age = generateNumber("age", i, meta);
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(78);
    }
  });

  it("generates port starting from 3000", () => {
    expect(generateNumber("port", 1, meta)).toBe(3001);
  });

  it("respects schema min/max constraints", () => {
    const constrained = { type: "number" as const, min: 10, max: 20 };
    for (let i = 1; i <= 20; i++) {
      const val = generateNumber("value", i, constrained);
      expect(val).toBeGreaterThanOrEqual(10);
      expect(val).toBeLessThanOrEqual(20);
    }
  });

  it("falls back to index for unknown fields", () => {
    expect(generateNumber("unknownField", 7, meta)).toBe(7);
  });
});

// ── generateValue ────────────────────────────────────────────────────────────

describe("generateValue", () => {
  it("returns defaultValue when present", () => {
    expect(generateValue("x", { type: "string", defaultValue: "hello" }, 1)).toBe("hello");
  });

  it("unwraps optional and generates inner value", () => {
    const meta = { type: "optional" as const, innerField: { type: "string" as const } };
    const val = generateValue("name", meta, 1);
    expect(typeof val).toBe("string");
  });

  it("returns null for optional without inner", () => {
    expect(generateValue("x", { type: "optional" as const }, 1)).toBeNull();
  });

  it("returns literal value", () => {
    expect(generateValue("x", { type: "literal" as const, literalValue: 42 }, 1)).toBe(42);
  });

  it("cycles enum values by index", () => {
    const meta = { type: "enum" as const, enumValues: ["a", "b", "c"] };
    expect(generateValue("x", meta, 0)).toBe("a");
    expect(generateValue("x", meta, 1)).toBe("b");
    expect(generateValue("x", meta, 3)).toBe("a");
  });

  it("generates string values", () => {
    expect(typeof generateValue("name", { type: "string" as const }, 1)).toBe("string");
  });

  it("generates number values", () => {
    expect(typeof generateValue("count", { type: "number" as const }, 1)).toBe("number");
  });

  it("generates boolean values", () => {
    expect(typeof generateValue("active", { type: "boolean" as const }, 1)).toBe("boolean");
  });

  it("generates date string", () => {
    const val = generateValue("createdAt", { type: "date" as const }, 1);
    expect(typeof val).toBe("string");
    expect(new Date(val as string).toISOString()).toBe(val);
  });

  it("returns empty array at depth limit for array type", () => {
    const meta = { type: "array" as const, innerField: { type: "string" as const } };
    const val = generateValue("tags", meta, 1, "generic", 3);
    expect(val).toEqual([]);
  });

  it("returns empty object at depth limit for object type", () => {
    const val = generateValue("nested", { type: "object" as const, shape: {} }, 1, "generic", 3);
    expect(val).toEqual({});
  });

  it("returns null at depth limit for union type", () => {
    const meta = { type: "union" as const, variants: [{ type: "string" as const }] };
    expect(generateValue("x", meta, 1, "generic", 3)).toBeNull();
  });
});

// ── generateFallbackRecords ──────────────────────────────────────────────────

describe("generateFallbackRecords", () => {
  it("generates records with id and name", () => {
    const records = generateFallbackRecords(3, 1);
    expect(records).toHaveLength(3);
    expect(records[0]).toHaveProperty("id", 1);
    expect(records[0]).toHaveProperty("name");
    expect(records[2]).toHaveProperty("id", 3);
  });

  it("uses startId offset", () => {
    const records = generateFallbackRecords(2, 10);
    expect(records[0]!.id).toBe(10);
    expect(records[1]!.id).toBe(11);
  });
});

// ── Schema introspection ─────────────────────────────────────────────────────

describe("schema introspection", () => {
  describe("extractShape", () => {
    it("extracts shape from Zod object", () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const shape = extractShape(schema);
      expect(shape).toBeDefined();
      expect(Object.keys(shape!)).toEqual(["name", "age"]);
    });

    it("returns undefined for non-object schemas", () => {
      expect(extractShape(z.string())).toBeUndefined();
      expect(extractShape(z.number())).toBeUndefined();
    });
  });

  describe("unwrapArraySchema", () => {
    it("extracts inner schema from array", () => {
      const inner = z.object({ id: z.string() });
      const arr = z.array(inner);
      const unwrapped = unwrapArraySchema(arr);
      expect(unwrapped).toBeDefined();
      expect(extractShape(unwrapped)).toBeDefined();
    });

    it("returns undefined for non-array schemas", () => {
      expect(unwrapArraySchema(z.string())).toBeUndefined();
      expect(unwrapArraySchema(z.object({ x: z.string() }))).toBeUndefined();
    });
  });

  describe("analyzeField", () => {
    it("detects string type", () => {
      expect(analyzeField(z.string()).type).toBe("string");
    });

    it("detects number type", () => {
      expect(analyzeField(z.number()).type).toBe("number");
    });

    it("detects boolean type", () => {
      expect(analyzeField(z.boolean()).type).toBe("boolean");
    });

    it("detects enum type with values", () => {
      const meta = analyzeField(z.enum(["admin", "user"]));
      expect(meta.type).toBe("enum");
      expect(meta.enumValues).toEqual(["admin", "user"]);
    });

    it("detects optional type with inner", () => {
      const meta = analyzeField(z.string().optional());
      expect(meta.type).toBe("optional");
      expect(meta.innerField?.type).toBe("string");
    });

    it("detects nullable type with inner", () => {
      const meta = analyzeField(z.string().nullable());
      expect(meta.type).toBe("nullable");
      expect(meta.innerField?.type).toBe("string");
    });

    it("detects array type with inner element", () => {
      const meta = analyzeField(z.array(z.number()));
      expect(meta.type).toBe("array");
      expect(meta.innerField?.type).toBe("number");
    });

    it("detects object type with shape", () => {
      const meta = analyzeField(z.object({ x: z.string() }));
      expect(meta.type).toBe("object");
      expect(meta.shape).toBeDefined();
      expect(Object.keys(meta.shape!)).toEqual(["x"]);
    });

    it("detects literal type", () => {
      const meta = analyzeField(z.literal("active"));
      expect(meta.type).toBe("literal");
      expect(meta.literalValue).toBe("active");
    });

    it("detects number constraints", () => {
      const meta = analyzeField(z.number().min(0).max(100));
      expect(meta.type).toBe("number");
      expect(meta.min).toBe(0);
      expect(meta.max).toBe(100);
    });

    it("detects exclusive bounds, integer and step", () => {
      const meta = analyzeField(z.number().int().positive().lt(50).multipleOf(5));
      expect(meta).toMatchObject({
        integer: true,
        min: 0,
        exclusiveMin: true,
        max: 50,
        exclusiveMax: true,
        multipleOf: 5,
      });
    });

    it("detects string length, format and pattern", () => {
      const meta = analyzeField(z.email().max(30));
      expect(meta).toMatchObject({ type: "string", format: "email", maxLength: 30 });
      expect(meta.patterns).toHaveLength(1);
    });

    it("detects tuple type", () => {
      const meta = analyzeField(z.tuple([z.string(), z.number()]));
      expect(meta.type).toBe("tuple");
      expect(meta.items).toHaveLength(2);
    });

    it("detects record type", () => {
      const meta = analyzeField(z.record(z.string(), z.boolean()));
      expect(meta.type).toBe("record");
      expect(meta.valueField?.type).toBe("boolean");
    });

    it("preserves default value", () => {
      const meta = analyzeField(z.string().default("hello"));
      expect(meta.defaultValue).toBe("hello");
    });
  });
});

// ── generateRecords (end-to-end with real schemas) ───────────────────────────

describe("generateRecords", () => {
  it("generates records from Zod object schema", () => {
    const schema = z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      age: z.number(),
      isActive: z.boolean(),
    });

    const records = generateRecords(schema, 5);
    expect(records).toHaveLength(5);

    for (const record of records) {
      expect(typeof record.id).toBe("string");
      expect(typeof record.name).toBe("string");
      expect(typeof record.email).toBe("string");
      expect(typeof record.age).toBe("number");
      expect(typeof record.isActive).toBe("boolean");
    }
  });

  it("generates records from array schema (unwraps)", () => {
    const schema = z.array(z.object({ id: z.string(), title: z.string() }));
    const records = generateRecords(schema, 3);
    expect(records).toHaveLength(3);
    expect(typeof records[0]!.id).toBe("string");
    expect(typeof records[0]!.title).toBe("string");
  });

  it("handles enums — cycles through values", () => {
    const schema = z.object({
      status: z.enum(["active", "inactive", "pending"]),
    });
    const records = generateRecords(schema, 6);
    const statuses = records.map((r) => r.status);
    expect(statuses).toContain("active");
    expect(statuses).toContain("inactive");
    expect(statuses).toContain("pending");
  });

  it("handles nested objects", () => {
    const schema = z.object({
      id: z.string(),
      address: z.object({ street: z.string(), city: z.string() }),
    });
    const records = generateRecords(schema, 2);
    const addr = records[0]!.address as Record<string, unknown>;
    expect(typeof addr.street).toBe("string");
    expect(typeof addr.city).toBe("string");
  });

  it("handles optional and nullable fields", () => {
    const schema = z.object({
      name: z.string(),
      bio: z.string().nullable(),
      nickname: z.string().optional(),
    });
    const records = generateRecords(schema, 3);
    for (const r of records) {
      expect(typeof r.name).toBe("string");
      // Nullable/optional still generate values (not null) for mock data
      expect(r.bio !== undefined).toBe(true);
    }
  });

  it("handles default values", () => {
    const schema = z.object({
      role: z.string().default("user"),
      active: z.boolean().default(true),
    });
    const records = generateRecords(schema, 2);
    expect(records[0]!.role).toBe("user");
    expect(records[0]!.active).toBe(true);
  });

  it("handles discriminated unions", () => {
    const schema = z.object({
      event: z.discriminatedUnion("type", [
        z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
        z.object({ type: z.literal("scroll"), offset: z.number() }),
      ]),
    });
    const records = generateRecords(schema, 4);
    for (const r of records) {
      const event = r.event as Record<string, unknown>;
      expect(["click", "scroll"]).toContain(event.type);
    }
  });

  it("handles tuple fields", () => {
    const schema = z.object({
      coords: z.tuple([z.number(), z.number()]),
    });
    const records = generateRecords(schema, 2);
    const coords = records[0]!.coords as number[];
    expect(coords).toHaveLength(2);
    expect(typeof coords[0]).toBe("number");
  });

  it("handles record/map fields", () => {
    const schema = z.object({
      settings: z.record(z.string(), z.boolean()),
    });
    const records = generateRecords(schema, 2);
    const settings = records[0]!.settings as Record<string, unknown>;
    expect(typeof settings.alpha).toBe("boolean");
    expect(typeof settings.beta).toBe("boolean");
    expect(typeof settings.gamma).toBe("boolean");
  });

  it("handles literal fields", () => {
    const schema = z.object({ version: z.literal(2) });
    const records = generateRecords(schema, 3);
    expect(records[0]!.version).toBe(2);
  });

  it("respects startId offset", () => {
    const schema = z.object({ id: z.string() });
    const records = generateRecords(schema, 2, 10);
    expect(records[0]!.id).toBe("id-10");
    expect(records[1]!.id).toBe("id-11");
  });

  it("falls back to fallback records for non-object schemas", () => {
    const records = generateRecords(z.string(), 3);
    expect(records).toHaveLength(3);
    expect(records[0]).toHaveProperty("id");
    expect(records[0]).toHaveProperty("name");
  });
});

describe("generateRecord", () => {
  it("generates a single record", () => {
    const schema = z.object({ id: z.string(), name: z.string() });
    const record = generateRecord(schema);
    expect(typeof record.id).toBe("string");
    expect(typeof record.name).toBe("string");
  });

  it("uses provided index", () => {
    const schema = z.object({ id: z.string() });
    const record = generateRecord(schema, 42);
    expect(record.id).toBe("id-42");
  });

  it("returns fallback for invalid schema", () => {
    const record = generateRecord(null, 5);
    expect(record.id).toBe(5);
    expect(typeof record.name).toBe("string");
  });
});
