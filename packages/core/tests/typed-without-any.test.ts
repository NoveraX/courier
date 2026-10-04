/**
 * The public types infer what an API declares, and nothing is `any`: a
 * caller's answers, a test client's mocks and a proxy caller's methods all
 * keep their types, and a call the API does not declare does not compile.
 * The type parameters of these entry points are not bounded with `any`,
 * which would let a shape that is not an API through.
 */
import { describe, expectTypeOf, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define";
import { createProxyCaller } from "../src/proxy-caller";
import { createTestClient } from "../src/testing";

/** `true` for `any` alone. */
type IsAny<T> = 0 extends 1 & T ? true : false;

interface User {
  id: number;
  name: string;
}

const { endpoint } = courier();
const api = defineApi({
  baseURL: "https://api.example.com",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: {
        list: endpoint.get("").response<User[]>(),
        byId: endpoint.get(":id").variables<{ id: number }>().response<User>(),
      },
    }),
  },
});

describe("a direct caller", () => {
  it("answers with the declared type, never any", () => {
    const caller = createCaller(api);
    type Answer = Awaited<ReturnType<typeof caller.users.byId>>;

    expectTypeOf<IsAny<Answer>>().toEqualTypeOf<false>();
    expectTypeOf<Answer>().toEqualTypeOf<User>();
    // @ts-expect-error byId takes { id: number }
    void (() => caller.users.byId({ id: "1" }));
  });
});

describe("a proxy caller", () => {
  it("keeps the API's methods and types", () => {
    const caller = createProxyCaller<typeof api>("api", { source: api });
    type Answer = Awaited<ReturnType<typeof caller.users.list>>;

    expectTypeOf<IsAny<Answer>>().toEqualTypeOf<false>();
    expectTypeOf<Answer>().toEqualTypeOf<User[]>();
    // @ts-expect-error there is no users.remove
    void (() => caller.users.remove());
  });
});

describe("a test client", () => {
  it("mocks only what the API declares, with its answer's type", () => {
    const test = createTestClient<typeof api>();

    expectTypeOf<IsAny<typeof test.client>>().toEqualTypeOf<false>();
    expectTypeOf(test.mock("users", "byId").resolves).parameter(0).toEqualTypeOf<User>();
    // @ts-expect-error there is no users.remove
    void (() => test.mock("users", "remove"));
  });

  it("is refused a shape that is not an API", () => {
    type NotAnApi = { options: { groups: { users: { options: object; list: () => unknown } } } };
    // @ts-expect-error a group's members must be endpoints
    void (() => createTestClient<NotAnApi>());
  });
});
