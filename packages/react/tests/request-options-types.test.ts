import type { WithOptions } from "@noverax/courier";
import { describe, expectTypeOf, it } from "vitest";

import type {
  CourierInfiniteQueryOptions,
  CourierMutationOptions,
  CourierQueryOptions,
} from "../src/types-options";

type User = { id: string; name: string };

/**
 * A hook's `requestOptions` are the options `.with()` takes: raw mode is
 * the `.raw` accessor's alone, since a hook's data stays typed as the
 * answer's body and could not hold the `{ status, headers, data }` raw
 * mode resolves to.
 */
describe("a hook's request options", () => {
  it("are the options .with() takes, raw mode left out", () => {
    type Query = NonNullable<CourierQueryOptions<User[], undefined>["requestOptions"]>;
    type Infinite = NonNullable<
      CourierInfiniteQueryOptions<User[], undefined, number>["requestOptions"]
    >;
    type Mutation = NonNullable<CourierMutationOptions<User, { name: string }>["requestOptions"]>;

    expectTypeOf<Query>().toEqualTypeOf<WithOptions>();
    expectTypeOf<Infinite>().toEqualTypeOf<WithOptions>();
    expectTypeOf<Mutation>().toEqualTypeOf<WithOptions>();
    expectTypeOf<Query>().not.toHaveProperty("rawData");
  });
});
