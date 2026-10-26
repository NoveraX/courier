/**
 * Which causes an agent may be told the text of: the network's failures,
 * whose text says where a request went and why it got no answer, and no
 * other — read from the one table every rule that tells them apart is
 * held to.
 */
import { describe, expect, it } from "vitest";

import { NETWORK_FAILURES, OTHER_FAILURES } from "../../../core/tests/helpers/network-failures";
import { isNetworkReason, networkMembers } from "../../src/tools/network-reason";

describe("isNetworkReason", () => {
  it.each(NETWORK_FAILURES)("takes %s", (_, error) => {
    expect(isNetworkReason(error)).toBe(true);
  });

  it.each(OTHER_FAILURES)("leaves out %s", (_, error) => {
    expect(isNetworkReason(error)).toBe(false);
  });
});

describe("networkMembers", () => {
  it("keeps the network's failures an AggregateError gathered, in its order", () => {
    const gathered = new AggregateError(
      [...NETWORK_FAILURES.slice(0, 2), ...OTHER_FAILURES.slice(0, 2)].map(([, error]) => error),
    );

    expect(networkMembers(gathered).map((member) => member.message)).toEqual([
      "connect ECONNREFUSED 10.0.0.5:8080",
      "connect ECONNREFUSED fe80::1%en0:8080",
    ]);
  });
});
