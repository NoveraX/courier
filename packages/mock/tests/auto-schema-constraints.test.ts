/**
 * Auto-generated records held to the checks their own schema declares.
 *
 * A typed client validates every response against the endpoint's schema, so
 * a record that breaks a bound, a length, a format or an integer check makes
 * each call to the auto mock reject — the data has to satisfy the schema, not
 * merely resemble its field names.
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import * as v from "valibot";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { z as z3 } from "zod/v3";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { generateRecords } from "../src/auto/data-generator";

const { endpoint } = courier();

async function issuesOf(schema: StandardSchemaV1, records: unknown[]): Promise<string[]> {
  const issues = new Set<string>();
  for (const record of records) {
    const result = await schema["~standard"].validate(record);
    for (const issue of result.issues ?? []) {
      const path = issue.path?.map((p) => (typeof p === "object" ? p.key : p)).join(".");
      issues.add(`${path}: ${issue.message}`);
    }
  }
  return [...issues];
}

const User = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(40),
  email: z.email(),
  age: z.number().int().min(21).max(99),
  rating: z.number().int().min(1).max(5),
  website: z.url(),
  createdAt: z.iso.datetime(),
  birthday: z.iso.date(),
  opensAt: z.iso.time(),
  zip: z.string().regex(/^\d{5}$/),
  nickname: z.string().max(8),
  code: z.string().length(6),
  handle: z.string().startsWith("@").min(4).max(12),
  slugged: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/),
  tags: z.array(z.string()).min(4).max(6),
});

const Pet = z.object({
  petId: z.uuid(),
  tagId: z.uuidv4(),
  ref: z.cuid(),
  price: z.number().int().positive(),
  weight: z.number().gt(0).lt(1),
  step: z.number().multipleOf(5).min(12),
  small: z.int32().max(-7),
});

describe("generated records satisfy the schema's own checks", () => {
  it("honours zod v4 bounds, integer, length and format checks", async () => {
    expect(await issuesOf(User, generateRecords(User, 30))).toEqual([]);
    expect(await issuesOf(Pet, generateRecords(Pet, 30))).toEqual([]);
  });

  it("honours zod v3 checks", async () => {
    const Legacy = z3.object({
      age: z3.number().int().min(21).max(99),
      price: z3.number().int().positive(),
      nickname: z3.string().max(8),
      petId: z3.string().uuid(),
      email: z3.string().email(),
      stamp: z3.string().datetime(),
      zip: z3.string().regex(/^\d{5}$/),
      tags: z3.array(z3.string()).min(4),
    });
    expect(await issuesOf(Legacy, generateRecords(Legacy, 30))).toEqual([]);
  });

  it("honours valibot pipe actions", async () => {
    const Item = v.object({
      id: v.pipe(v.number(), v.integer(), v.minValue(1)),
      code: v.pipe(v.string(), v.maxLength(4)),
      score: v.pipe(v.number(), v.minValue(10), v.maxValue(20)),
      ratio: v.pipe(v.number(), v.gtValue(0), v.ltValue(1)),
      email: v.pipe(v.string(), v.email()),
      itemId: v.pipe(v.string(), v.uuid()),
      at: v.pipe(v.string(), v.isoDateTime()),
      day: v.pipe(v.string(), v.isoDate()),
      pin: v.pipe(v.string(), v.regex(/^[0-9]{4}$/)),
      labels: v.pipe(v.array(v.string()), v.minLength(5)),
    });
    expect(await issuesOf(Item, generateRecords(Item, 30))).toEqual([]);
  });
});

describe("a typed client reads the auto mock", () => {
  const running: Array<{ stop(): Promise<void> }> = [];
  afterEach(async () => {
    for (const server of running.splice(0)) await server.stop();
  });

  function usersApi(baseURL: string) {
    return defineApi({
      baseURL,
      groups: {
        users: defineGroup({
          prefix: "users",
          endpoints: {
            list: endpoint.get("").response(z.array(User)),
            get: endpoint.get(":id").variables<{ id: number }>().response(User),
          },
        }),
      },
    });
  }

  it("resolves list and get, both validated against the zod schema", async () => {
    const server = createAutoMockServer({
      source: usersApi("http://placeholder.invalid"),
      port: 0,
      log: false,
      studio: false,
      seed: { count: 6 },
    });
    running.push(server);
    const { url } = await server.start();
    const client = createCaller(usersApi(url));

    const users = await client.users.list();
    expect(users).toHaveLength(6);
    const second = await client.users.get({ id: 2 });
    expect(second.id).toBe(2);
    expect(second.age).toBeGreaterThanOrEqual(21);
  });
});
