/**
 * A declared source reaches the UI with what the Playground needs to send
 * to it — each stream's transport, its variables and the proxy routes —
 * and a source whose fields have the wrong shape is left out.
 */
import { describe, expect, it } from "vitest";

import { isScannedSource } from "../src/socket/source-list-guards";
import { API } from "./playground-fixtures";

function withTicks(analysis: Record<string, unknown>): unknown {
  const live = API.groups[2];
  const ticks = { name: "ticks", analysis: { ...live.endpoints[0].analysis, ...analysis } };
  return { ...API, groups: [{ ...live, endpoints: [ticks] }] };
}

describe("a declared source from Studio", () => {
  it("is shown with its transports, variable stubs and proxy routes", () => {
    expect(isScannedSource(withTicks({ variablesStub: { count: 0 }, hasReceiveSchema: true }))).toBe(true);
  });

  it("is left out when a field it carries has the wrong shape", () => {
    expect(isScannedSource(withTicks({ transport: "grpc" }))).toBe(false);
    expect(isScannedSource(withTicks({ variablesStub: "count" }))).toBe(false);
    expect(isScannedSource({ ...API, proxyPath: { http: 1 } })).toBe(false);
    expect(isScannedSource({ ...API, proxyPath: { ftp: "/files" } })).toBe(false);
  });
});
