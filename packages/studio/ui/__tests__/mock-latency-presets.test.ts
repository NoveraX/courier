/**
 * The latency Studio shows and sends for a network profile is the latency
 * the mock itself gives it. Studio's 3G was 300–600 ms while the mock's was
 * 300–900 ms, and a recorded scenario turned 3G into 2000 ms.
 */
import { describe, expect, it } from "vitest"

import { LATENCY_PROFILES } from "../../../mock/src/network/latency"
import { PRESET_VALUES } from "../src/views/mocks/network/latency-presets"

describe("Studio's latency profiles", () => {
  it.each(["3g", "4g"] as const)("send the mock's own range for %s", (profile) => {
    expect(PRESET_VALUES[profile]).toEqual(LATENCY_PROFILES[profile])
  })
})
