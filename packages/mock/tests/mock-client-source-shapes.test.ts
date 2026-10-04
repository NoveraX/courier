/**
 * The mock client for every shape of source `defineApi` makes: grouped,
 * flat and mixed.
 *
 * Its type takes each of them, as `createCaller` does for the same sources:
 * `createMockClient<typeof flatApi>()` compiles, and a mixed source's client
 * has its top-level endpoints. This file is checked by the package's `tsc`
 * run as well as run.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createMockClient } from "../src/create-mock-client";

const { endpoint } = courier();

type User = { id: number; name: string };

const flatApi = defineApi({
  baseURL: "http://placeholder.invalid",
  endpoints: { listUsers: endpoint.get("users").response<User[]>() },
});

const users = defineGroup({
  prefix: "users",
  endpoints: { getAll: endpoint.get("").response<User[]>() },
});
const mixedApi = defineApi({
  baseURL: "http://placeholder.invalid",
  groups: { users },
  endpoints: { health: endpoint.get("health").response<{ ok: boolean }>() },
});

describe("createMockClient for a flat source", () => {
  it("types and answers its endpoints", async () => {
    const { client, mock } = createMockClient<typeof flatApi>();
    mock("users", "listUsers").resolves([{ id: 1, name: "Ada" }]);

    const listed = client.listUsers();
    expectTypeOf(listed).resolves.toEqualTypeOf<User[]>();
    expect(await listed).toEqual([{ id: 1, name: "Ada" }]);
  });
});

describe("createMockClient for a mixed source", () => {
  it("types and answers both its groups and its top-level endpoints", async () => {
    const { client, mock } = createMockClient<typeof mixedApi>();
    mock("users", "getAll").resolves([{ id: 2, name: "Grace" }]);
    mock("health", "health").resolves({ ok: true });

    const health = client.health();
    expectTypeOf(health).resolves.toEqualTypeOf<{ ok: boolean }>();
    expect(await health).toEqual({ ok: true });
    expect(await client.users.getAll()).toEqual([{ id: 2, name: "Grace" }]);
  });
});
