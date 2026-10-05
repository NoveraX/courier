/**
 * The latency Studio shows and sends for a network profile is the latency
 * the mock itself gives it — 300–900 ms for 3G — not a range of Studio's
 * own.
 */
import { describe, expect, it } from "vitest";
import { PRESET_VALUES } from "@/features/mocks/latency-config";
import { LATENCY_PROFILES } from "../../../mock/src/network/latency";

describe("Studio's latency profiles", () => {
  it.each(["3g", "4g"] as const)("send the mock's own range for %s", (profile) => {
    expect(PRESET_VALUES[profile]).toEqual(LATENCY_PROFILES[profile]);
  });
});
