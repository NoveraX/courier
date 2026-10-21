/**
 * The site counts visits only on the published site, from a production
 * build, in a browser a person drives — never on a developer's machine, in
 * a preview, in a test or on another NoveraX host — and even there only
 * once the reader agrees, which the consent store decides.
 */
import { describe, expect, it } from "vitest"

import { analyticsAllowed } from "@/site/analytics/analytics-gate"

const PUBLISHED = { hostname: "courier.noverax.cloud", production: true, automated: false }

describe("the analytics gate", () => {
  it("opens on the published site's production build, in a browser a person drives", () => {
    expect(analyticsAllowed(PUBLISHED)).toBe(true)
  })

  it("stays shut on every other host, a production build or not", () => {
    for (const hostname of [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "www.courier.noverax.cloud",
      "demo.courier.noverax.cloud",
      "noverax.cloud",
      "courier.noverax.cloud.example.com",
      "preview.courier.noverax.cloud",
    ]) {
      expect(analyticsAllowed({ ...PUBLISHED, hostname }), hostname).toBe(false)
    }
  })

  it("stays shut in a development or test build on the published host", () => {
    expect(analyticsAllowed({ ...PUBLISHED, production: false })).toBe(false)
  })

  it("stays shut where a machine drives the browser", () => {
    expect(analyticsAllowed({ ...PUBLISHED, automated: true })).toBe(false)
  })
})
