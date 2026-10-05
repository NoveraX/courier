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
  const first = live?.endpoints[0];
  if (live === undefined || first === undefined) throw new Error("The fixture has no live group");
  const ticks = { name: "ticks", analysis: { ...first.analysis, ...analysis } };
  return { ...API, groups: [{ ...live, endpoints: [ticks] }] };
}

describe("a declared source from Studio", () => {
  it("is shown with its transports, variable stubs and fields, and proxy routes", () => {
    expect(
      isScannedSource(withTicks({ variablesStub: { count: 0 }, hasReceiveSchema: true })),
    ).toBe(true);
    expect(
      isScannedSource(
        withTicks({ variablesFields: [{ path: "count", type: "number", required: true }] }),
      ),
    ).toBe(true);
  });

  it("keeps a stream the app serves itself", () => {
    expect(isScannedSource(withTicks({ served: true }))).toBe(true);
  });

  it("is left out when a field it carries has the wrong shape", () => {
    expect(isScannedSource(withTicks({ transport: "grpc" }))).toBe(false);
    expect(isScannedSource(withTicks({ served: "yes" }))).toBe(false);
    expect(isScannedSource(withTicks({ variablesStub: "count" }))).toBe(false);
    expect(
      isScannedSource(withTicks({ variablesFields: [{ path: "count", type: "number" }] })),
    ).toBe(false);
    expect(isScannedSource({ ...API, proxyPath: { http: 1 } })).toBe(false);
    expect(isScannedSource({ ...API, proxyPath: { ftp: "/files" } })).toBe(false);
  });
});
