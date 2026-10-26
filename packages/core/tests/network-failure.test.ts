/**
 * Which errors under a failure are the network's: read from the one table
 * every rule that tells them apart is held to — Courier's MCP server tells
 * an agent its causes by the same.
 */
import { describe, expect, it } from "vitest";

import { isNetworkFailure } from "../src/studio/network-failure";
import { NETWORK_FAILURES, OTHER_FAILURES } from "./helpers/network-failures";

describe("isNetworkFailure", () => {
  it.each(NETWORK_FAILURES)("takes %s", (_, error) => {
    expect(isNetworkFailure(error)).toBe(true);
  });

  it.each(OTHER_FAILURES)("leaves out %s", (_, error) => {
    expect(isNetworkFailure(error)).toBe(false);
  });
});
