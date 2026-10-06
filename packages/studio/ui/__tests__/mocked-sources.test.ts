/**
 * The mocks that already serve each source: the managed mocks Studio runs
 * from courier.mocks.ts, by the config's source each one serves.
 */
import { describe, expect, it } from "vitest";
import { mockedSources } from "@/features/mocks/wizard/mocked-sources";
import type { MockServerInfo } from "@/store/mock-slice";

function server(serverId: string, fields: Partial<MockServerInfo>): MockServerInfo {
  return { serverId, managed: true, ...fields } as MockServerInfo;
}

describe("the sources already mocked", () => {
  it("lists each source's mocks, and leaves out a mock of no declared source or not run by Studio", () => {
    const mocked = mockedSources({
      b: server("b", { source: "shop" }),
      a: server("a", { source: "shop" }),
      other: server("other", {}),
      external: server("external", { source: "billing", managed: false }),
    });

    expect(mocked).toEqual(new Map([["shop", ["a", "b"]]]));
  });
});
