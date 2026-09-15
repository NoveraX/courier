import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineApi, defineGroup, courier } from "@noverax/courier/define";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { query, mutation } = courier();

// ── Schemas ──────────────────────────────────────────────────────────────────

const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string(),
});

const OwnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  address: AddressSchema,
  tags: z.array(z.string()),
  settings: z.record(z.string(), z.boolean()),
  role: z.enum(["admin", "user", "moderator"]),
  locale: z.string().default("en"),
  isActive: z.boolean().default(true),
  bio: z.string().nullable(),
});

const CheckupSchema = z.object({ type: z.literal("checkup"), notes: z.string() });
const SurgerySchema = z.object({ type: z.literal("surgery"), duration: z.number() });
const ProcedureSchema = z.discriminatedUnion("type", [CheckupSchema, SurgerySchema]);

const PetSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  owner: z.object({ id: z.string(), name: z.string() }),
  procedure: ProcedureSchema,
  coordinates: z.tuple([z.number(), z.number()]),
  scores: z.array(z.number()),
  vaccinations: z.array(z.object({ name: z.string(), date: z.string() })),
  status: z.enum(["active", "adopted", "quarantine"]),
  version: z.literal(1),
});

const PaginatedSchema = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string() })),
  total: z.number(),
  page: z.number(),
});

// ── API Source ────────────────────────────────────────────────────────────────

const api = defineApi({
  baseURL: "https://test.api",
  groups: {
    owners: defineGroup({
      prefix: "/owners",
      endpoints: {
        listOwners: query.response(z.array(OwnerSchema)).via((http) => http.get("")),
        getOwner: query.variables<{ ownerId: string }>().response(OwnerSchema).via((http, vars) => http.get(":ownerId", vars)),
        createOwner: mutation.variables(z.object({ name: z.string(), email: z.string() })).response(OwnerSchema).via((http, vars) => http.post("", vars)),
        deleteOwner: mutation.via((http, vars) => http.del(":ownerId", vars)),
      },
    }),
    pets: defineGroup({
      prefix: "/pets",
      endpoints: {
        listPets: query.response(z.array(PetSchema)).via((http) => http.get("")),
        getPet: query.variables<{ petId: string }>().response(PetSchema).via((http, vars) => http.get(":petId", vars)),
      },
    }),
    catalog: defineGroup({
      prefix: "/catalog",
      endpoints: {
        browse: query.response(PaginatedSchema).via((http) => http.get("browse")),
        listItems: query.response(z.array(z.object({ id: z.string(), title: z.string(), price: z.number() }))).via((http) => http.get("")),
      },
    }),
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("auto-mock server", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    studio: false,
    seed: { count: 10, owners: { count: 5 }, pets: 15 },
    overrides: (mock) => {
      // Decorator-only: add headers without replacing handler
      mock("owners", "listOwners").withHeaders({ "X-Total": "5" });

      // Custom handler with named param
      mock("owners", "getOwner").returns((ctx) => {
        const vars = ctx.variables as Record<string, unknown>;
        return { id: vars.ownerId, name: "Custom", email: "custom@test.com" };
      });

      // Conditional error
      mock("owners", "deleteOwner").returns((ctx) => {
        const vars = ctx.variables as Record<string, unknown>;
        if (vars.ownerId === "id-1") throw new Error("Protected owner");
        return { deleted: true };
      });

      // Latency decorator
      mock("pets", "listPets").delay(50);
    },
    scenarios: {
      maintenance: {
        name: "maintenance",
        apply(mock) {
          (mock as any)("owners", "listOwners").rejects(503, { message: "Maintenance" });
        },
      },
    },
  });

  let url: string;

  beforeAll(async () => {
    const info = await server.start();
    url = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  // ── Seed counts ──────────────────────────────────────────────────────────

  describe("seed counts", () => {
    it("respects per-group count overrides", async () => {
      const owners = await fetch(`${url}/owners`).then((r) => r.json());
      expect(owners).toHaveLength(5);

      const pets = await fetch(`${url}/pets`).then((r) => r.json());
      expect(pets).toHaveLength(15);
    });

    it("uses default count when no override", async () => {
      const catalog = await fetch(`${url}/catalog`).then((r) => r.json());
      expect(catalog).toHaveLength(10);
    });
  });

  // ── Compound types ───────────────────────────────────────────────────────

  describe("compound type generation", () => {
    it("generates nested objects", async () => {
      const owners = await fetch(`${url}/owners`).then((r) => r.json());
      const owner = owners[0];
      expect(owner.address).toEqual(
        expect.objectContaining({ street: expect.any(String), city: expect.any(String) }),
      );
    });

    it("generates typed string arrays", async () => {
      const owners = await fetch(`${url}/owners`).then((r) => r.json());
      expect(Array.isArray(owners[0].tags)).toBe(true);
      expect(owners[0].tags.length).toBeGreaterThan(0);
      expect(typeof owners[0].tags[0]).toBe("string");
    });

    it("generates record types", async () => {
      const owners = await fetch(`${url}/owners`).then((r) => r.json());
      const settings = owners[0].settings;
      expect(typeof settings).toBe("object");
      expect(Object.keys(settings).length).toBeGreaterThan(0);
      expect(typeof Object.values(settings)[0]).toBe("boolean");
    });

    it("generates default values", async () => {
      const owners = await fetch(`${url}/owners`).then((r) => r.json());
      expect(owners[0].locale).toBe("en");
      expect(owners[0].isActive).toBe(true);
    });

    it("generates enum values", async () => {
      const owners = await fetch(`${url}/owners`).then((r) => r.json());
      expect(["admin", "user", "moderator"]).toContain(owners[0].role);
    });

    it("generates belongs-to relations as nested objects", async () => {
      const pets = await fetch(`${url}/pets`).then((r) => r.json());
      expect(pets[0].owner).toEqual(
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
      );
    });

    it("generates discriminated union with type field", async () => {
      const pets = await fetch(`${url}/pets`).then((r) => r.json());
      const types = new Set(pets.map((p: any) => p.procedure?.type));
      expect(types.has("checkup") || types.has("surgery")).toBe(true);
      for (const pet of pets) {
        expect(["checkup", "surgery"]).toContain(pet.procedure.type);
      }
    });

    it("generates tuples", async () => {
      const pets = await fetch(`${url}/pets`).then((r) => r.json());
      expect(Array.isArray(pets[0].coordinates)).toBe(true);
      expect(pets[0].coordinates).toHaveLength(2);
      expect(typeof pets[0].coordinates[0]).toBe("number");
    });

    it("generates typed number arrays", async () => {
      const pets = await fetch(`${url}/pets`).then((r) => r.json());
      expect(Array.isArray(pets[0].scores)).toBe(true);
      expect(typeof pets[0].scores[0]).toBe("number");
    });

    it("generates has-many (array of objects)", async () => {
      const pets = await fetch(`${url}/pets`).then((r) => r.json());
      expect(Array.isArray(pets[0].vaccinations)).toBe(true);
      expect(pets[0].vaccinations[0]).toEqual(
        expect.objectContaining({ name: expect.any(String), date: expect.any(String) }),
      );
    });

    it("generates literal values", async () => {
      const pets = await fetch(`${url}/pets`).then((r) => r.json());
      expect(pets[0].version).toBe(1);
    });
  });

  // ── Routing ──────────────────────────────────────────────────────────────

  describe("routing with named params", () => {
    it("routes GET /:id to the correct get endpoint", async () => {
      const res = await fetch(`${url}/owners/id-3`);
      expect(res.status).toBe(200);
      const body = await res.json();
      // Override uses ownerId from variables
      expect(body.id).toBe("id-3");
    });

    it("routes POST to create endpoint", async () => {
      const res = await fetch(`${url}/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", email: "t@t.com" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Test");
    });

    it("routes DELETE /:id to delete endpoint", async () => {
      const res = await fetch(`${url}/owners/id-2`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
    });
  });

  // ── Pagination wrapper detection ─────────────────────────────────────────

  describe("pagination wrapper seed", () => {
    it("seeds catalog from listItems (direct array), not browse (wrapper)", async () => {
      const items = await fetch(`${url}/catalog`).then((r) => r.json());
      expect(Array.isArray(items)).toBe(true);
      expect(items[0]).toEqual(
        expect.objectContaining({ id: expect.any(String), title: expect.any(String) }),
      );
      // Should NOT be pagination wrapper shape
      expect(items[0].total).toBeUndefined();
      expect(items[0].page).toBeUndefined();
    });
  });

  // ── Overrides ────────────────────────────────────────────────────────────

  describe("overrides", () => {
    it("decorator-only override preserves auto-CRUD handler", async () => {
      const res = await fetch(`${url}/owners`);
      const body = await res.json();
      // Data comes from auto-CRUD (seeded, may grow from POST tests)
      expect(body.length).toBeGreaterThanOrEqual(5);
      expect(body[0]).toHaveProperty("id");
      // Custom header applied
      expect(res.headers.get("x-total")).toBe("5");
    });

    it("custom handler receives named path params", async () => {
      const body = await fetch(`${url}/owners/test-id-99`).then((r) => r.json());
      expect(body.id).toBe("test-id-99");
      expect(body.name).toBe("Custom");
    });

    it("conditional error in override", async () => {
      const blocked = await fetch(`${url}/owners/id-1`, { method: "DELETE" });
      expect(blocked.status).toBe(500);
      const body = await blocked.json();
      expect(body.error).toContain("Protected owner");

      const allowed = await fetch(`${url}/owners/id-99`, { method: "DELETE" });
      expect(allowed.status).toBe(200);
    });

    it("delay decorator preserves auto-CRUD data", async () => {
      const start = performance.now();
      const res = await fetch(`${url}/pets`);
      const elapsed = performance.now() - start;

      const body = await res.json();
      expect(body).toHaveLength(15);
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});
