/**
 * Lending a capability: the first implementation of a slot stays, said
 * once at debug level when another one comes, and the same one again
 * changes nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InProcessProxyCapability } from "../../src/capabilities/in-process-proxy";
import {
  _resetServerCapabilitiesForTests,
  provideServerCapability,
} from "../../src/capabilities/provide-server-capability";
import { serverCapability } from "../../src/capabilities/registry";

function capability(): InProcessProxyCapability {
  return { route: () => undefined };
}

afterEach(() => {
  _resetServerCapabilitiesForTests("inProcessProxy");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* The debug lines the server's log prints. */
function debugLines(): string[][] {
  vi.stubEnv("COURIER_LOG_LEVEL", "debug");
  const lines: string[][] = [];
  vi.spyOn(console, "debug").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String));
  });
  return lines;
}

describe("provideServerCapability", () => {
  it("keeps the first implementation when another one is provided, and says so once", () => {
    const printed = debugLines();
    const first = capability();
    provideServerCapability("inProcessProxy", first);
    provideServerCapability("inProcessProxy", capability());

    expect(serverCapability("inProcessProxy")).toBe(first);
    expect(printed).toHaveLength(1);
    expect(printed[0]?.join(" ")).toContain("inProcessProxy was provided already");
  });

  it("changes nothing, and says nothing, when the same implementation is provided again", () => {
    const printed = debugLines();
    const provided = capability();
    provideServerCapability("inProcessProxy", provided);
    provideServerCapability("inProcessProxy", provided);

    expect(serverCapability("inProcessProxy")).toBe(provided);
    expect(printed).toEqual([]);
  });
});
