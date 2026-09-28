/**
 * What the root entry offers. The proxy transport's own call function, typed
 * and then cast to an untyped one on its only use, and the types it was typed
 * with were exported beside the API, undocumented, while the reference
 * described them as the engine of the clients' inference.
 */
import { describe, expect, it } from "vitest";

import * as courier from "../src";
// @ts-expect-error the proxy transport's call types are its own
import type { CallerFn, EndpointKey, ResolveEndpoint, SuccessResponse, UntypedCallerFn } from "../src";

describe("the root entry", () => {
  it("keeps the proxy transport's call function to itself", () => {
    expect(Object.keys(courier)).not.toContain("createProxyCallerFn");
    expect(Object.keys(courier)).toContain("createProxyCaller");
  });
});
