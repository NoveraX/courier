import { describe, expect, it } from "vitest";

import { networkCommandPatch } from "../src/network/command-patch";

describe("networkCommandPatch", () => {
  it("holds only the keys the command names", () => {
    expect(networkCommandPatch({ routeOverrides: [] })).toEqual({ routeOverrides: [] });
    expect(networkCommandPatch({ errorRate: 0.5 })).toEqual({ errorRate: 0.5 });
  });

  it("names latency as undefined when the command turns it off", () => {
    const patch = networkCommandPatch({ latency: 0, bandwidth: 0 });
    expect(Object.hasOwn(patch, "latency")).toBe(true);
    expect(patch).toEqual({ latency: undefined, bandwidth: 0 });
  });

  it("reads a latency range with its distribution, and a preset name", () => {
    expect(networkCommandPatch({ latency: { min: 5, max: 9, distribution: "normal" } })).toEqual({
      latency: { min: 5, max: 9 },
      distribution: "normal",
    });
    expect(networkCommandPatch({ latency: "3g" })).toEqual({ latency: "3g" });
    expect(networkCommandPatch({ latency: "warp" })).toEqual({ latency: undefined });
  });

  it("drops malformed entries instead of merging them", () => {
    const patch = networkCommandPatch({
      faultWeights: [{ type: "503", weight: 60 }, { weight: 40 }, "500"],
      routeOverrides: [{ routeId: "users:get", enabled: true }, { enabled: true }],
    });
    expect(patch).toEqual({
      faultWeights: [{ type: "503", weight: 60 }],
      routeOverrides: [{ routeId: "users:get", enabled: true }],
    });
  });

  it("holds nothing for a command without a config", () => {
    expect(networkCommandPatch(undefined)).toEqual({});
  });
});
