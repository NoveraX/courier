import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createQueryCaller } from "../src/create-query-caller";

const { endpoint } = courier();

const ping = endpoint.get("ping").response<{ ok: boolean }>();

/**
 * Hooks are offered per group, as the README says: an endpoint declared at
 * the top level of `defineApi` has none, and a caller says so at compile time
 * rather than failing when a component renders.
 */
describe("endpoints outside a group", () => {
  it("are refused for an API that has no groups", () => {
    const flat = defineApi({ baseURL: "https://example.com", endpoints: { ping } });
    function refused(): void {
      // @ts-expect-error — hooks are offered per group
      createQueryCaller(flat);
    }

    expect(refused).toBeTypeOf("function");
  });

  it("are left out of a caller for an API that mixes them with groups", () => {
    const mixed = defineApi({
      baseURL: "https://example.com",
      endpoints: { ping },
      groups: { health: defineGroup({ prefix: "/health", endpoints: { ping } }) },
    });
    const q = createQueryCaller(mixed);
    function used(): void {
      q.health.useQuery("ping");
      // @ts-expect-error — ping is declared at the top level, outside any group
      q.ping.useQuery("ping");
    }

    expect(used).toBeTypeOf("function");
  });
});
