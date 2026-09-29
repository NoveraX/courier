/**
 * A mock's `returns` receives the variables its endpoint is called with,
 * typed as the endpoint declares them. Typed `unknown`, every dynamic mock
 * needed a cast before it could read a single field.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { courier, defineApi, defineGroup } from "../src/define";
import { createTestClient } from "../src/testing/index";

type User = { id: string; name: string; email: string };

const { endpoint } = courier();

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
    create: endpoint.post("").variables<{ name: string; email: string }>().response<User>(),
  },
});

const api = defineApi({ baseURL: "https://api.example.com", groups: { users } });

describe("a mock's returns", () => {
  it("receives the variables of the call, typed as the endpoint declares them", async () => {
    const { client, mock } = createTestClient<typeof api>();
    mock("users", "create").returns((variables) => {
      expectTypeOf(variables).toEqualTypeOf<{ name: string; email: string }>();
      return { id: "2", ...variables };
    });

    const user = await client.users.create({ name: "Jane", email: "jane@example.com" });

    expect(user).toEqual({ id: "2", name: "Jane", email: "jane@example.com" });
  });

  it("reads a path variable without a cast", async () => {
    const { client, mock } = createTestClient<typeof api>();
    mock("users", "getById").returns(({ id }) => ({
      id,
      name: `User ${id}`,
      email: `${id}@example.com`,
    }));

    const user = await client.users.getById({ id: "7" });

    expect(user).toEqual({ id: "7", name: "User 7", email: "7@example.com" });
  });

  it("must return the endpoint's response", () => {
    const { mock } = createTestClient<typeof api>();

    // @ts-expect-error — a user has an email
    mock("users", "getById").returns(({ id }) => ({ id, name: "No email" }));
  });
});
