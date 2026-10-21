/**
 * Yandex Metrica as the site runs it: a command queue put in place as the
 * counter's own snippet does, a counter that records no sessions and no
 * clicks and counts only the page views the site sends, taken down and
 * flagged off once the reader withdraws.
 */
import { describe, expect, it } from "vitest"

import type { MetricaWindow } from "@/site/analytics/metrica"
import { countPageView, metricaQueue, startMetrica, stopMetrica } from "@/site/analytics/metrica"
import { METRICA_COUNTER, METRICA_OPTIONS, METRICA_TAG } from "@/site/analytics/metrica-config"

const NOW = Date.UTC(2026, 9, 21, 12)

function queued(win: MetricaWindow): unknown[][] {
  return (win.ym?.a ?? []).map((call) => Array.from(call))
}

describe("the counter", () => {
  it("is loaded from the address the counter's own snippet gives, over HTTPS", () => {
    expect(METRICA_TAG).toBe(`https://mc.webvisor.org/metrika/tag_ww.js?id=${METRICA_COUNTER}`)
  })

  it("records no sessions, no click maps, no anchors and no frames, and counts only the page views the site sends", () => {
    expect(METRICA_OPTIONS).toEqual({
      ssr: true,
      defer: true,
      webvisor: false,
      clickmap: false,
      trackLinks: true,
      accurateTrackBounce: true,
      trackHash: false,
      childIframe: false,
      triggerEvent: false,
      sendTitle: true,
      disableYtm: true,
    })
    expect(METRICA_OPTIONS).not.toHaveProperty("ecommerce")
  })
})

describe("the command queue", () => {
  it("keeps each call as its arguments object until the counter's code loads", () => {
    const win: MetricaWindow = {}

    const ym = metricaQueue(win, NOW)
    ym(METRICA_COUNTER, "hit", "https://courier.noverax.cloud/")

    expect(win.ym).toBe(ym)
    expect(ym.l).toBe(NOW)
    expect(Object.prototype.toString.call(ym.a?.[0])).toBe("[object Arguments]")
    expect(queued(win)).toEqual([[METRICA_COUNTER, "hit", "https://courier.noverax.cloud/"]])
  })

  it("is left as it is when the window has one already, the loaded counter's own", () => {
    const loaded = Object.assign(() => undefined, {})
    const win: MetricaWindow = { ym: loaded }

    expect(metricaQueue(win, NOW)).toBe(loaded)
  })
})

describe("starting, counting and stopping", () => {
  it("starts the counter with the site's options and lets it send", () => {
    const win: MetricaWindow = {}
    Reflect.set(win, `disableYaCounter${METRICA_COUNTER}`, true)

    startMetrica(win, NOW)

    expect(queued(win)).toEqual([[METRICA_COUNTER, "init", METRICA_OPTIONS]])
    expect(Reflect.get(win, `disableYaCounter${METRICA_COUNTER}`)).toBe(false)
  })

  it("counts a page view with its address, title and the page the reader came from", () => {
    const win: MetricaWindow = {}
    startMetrica(win, NOW)

    countPageView(win, {
      url: "https://courier.noverax.cloud/docs/quick-start",
      title: "Quick Start — Courier Docs",
      referer: "https://courier.noverax.cloud/",
    })

    expect(queued(win).at(-1)).toEqual([
      METRICA_COUNTER,
      "hit",
      "https://courier.noverax.cloud/docs/quick-start",
      { title: "Quick Start — Courier Docs", referer: "https://courier.noverax.cloud/" },
    ])
  })

  it("counts nothing where the counter was never started", () => {
    const win: MetricaWindow = {}

    countPageView(win, { url: "https://courier.noverax.cloud/", title: "Courier", referer: "" })

    expect(win.ym).toBeUndefined()
  })

  it("takes the counter down and raises the flag its code reads", () => {
    const win: MetricaWindow = {}
    startMetrica(win, NOW)

    stopMetrica(win)

    expect(queued(win).at(-1)).toEqual([METRICA_COUNTER, "destruct"])
    expect(Reflect.get(win, `disableYaCounter${METRICA_COUNTER}`)).toBe(true)
  })

  it("keeps a counter that never started from starting, with the flag alone", () => {
    const win: MetricaWindow = {}

    stopMetrica(win)

    expect(win.ym).toBeUndefined()
    expect(Reflect.get(win, `disableYaCounter${METRICA_COUNTER}`)).toBe(true)
  })
})
