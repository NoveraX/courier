/**
 * What a reader's withdrawal deletes: Metrica's cookies — those starting
 * `_ym` and its `gdpr` marker — for the site's host and every domain above
 * it, and what its code kept in the browser's storage, its tag manager's
 * keys and `zz` among them — and nothing of the site's own.
 */
import { describe, expect, it } from "vitest"

import type { CookieJar, ForgettingStorage } from "@/site/analytics/metrica-storage"
import {
  cookieDomains,
  forgetMetricaCookies,
  forgetMetricaStorage,
  metricaCookieNames,
} from "@/site/analytics/metrica-storage"

function jar(initial: string): CookieJar & { written: string[] } {
  const written: string[] = []
  return {
    written,
    get cookie() {
      return initial
    },
    set cookie(value: string) {
      written.push(value)
    },
  }
}

function storage(keys: string[]): ForgettingStorage & { kept: string[] } {
  const kept = [...keys]
  return {
    kept,
    get length() {
      return kept.length
    },
    key: (index) => kept[index] ?? null,
    removeItem: (key) => {
      const at = kept.indexOf(key)
      if (at >= 0) kept.splice(at, 1)
    },
  }
}

describe("the domains a cookie may have been set for", () => {
  it("are the host and each domain above it, down to the registrable one", () => {
    expect(cookieDomains("courier.noverax.cloud")).toEqual([
      "courier.noverax.cloud",
      "noverax.cloud",
    ])
    expect(cookieDomains("noverax.cloud")).toEqual(["noverax.cloud"])
    expect(cookieDomains("localhost")).toEqual([])
  })
})

describe("Metrica's cookies", () => {
  it("are told from the others by their prefix, and its gdpr marker by name", () => {
    expect(
      metricaCookieNames("theme=dark; _ym_uid=17; __ddg1_=x; _ym_d=1761000000; gdpr=0; gdpr_x=1")
    ).toEqual(["_ym_uid", "_ym_d", "gdpr"])
    expect(metricaCookieNames("")).toEqual([])
  })

  it("are deleted for the host and for every domain above it, the others left alone", () => {
    const cookies = jar("__ddg1_=x; _ym_uid=17; _ym_isad=2")

    forgetMetricaCookies(cookies, "courier.noverax.cloud")

    expect(cookies.written).toEqual([
      "_ym_uid=; Max-Age=0; Path=/",
      "_ym_uid=; Max-Age=0; Path=/; Domain=courier.noverax.cloud",
      "_ym_uid=; Max-Age=0; Path=/; Domain=noverax.cloud",
      "_ym_isad=; Max-Age=0; Path=/",
      "_ym_isad=; Max-Age=0; Path=/; Domain=courier.noverax.cloud",
      "_ym_isad=; Max-Age=0; Path=/; Domain=noverax.cloud",
    ])
  })
})

describe("Metrica's storage", () => {
  it("is cleared of the counter's and its tag manager's keys only", () => {
    const kept = storage([
      "theme",
      "_ym_uid",
      "courier:analytics-consent",
      "_ym113701816_lsid",
      "ytm_tag_113701816_1",
      "zz",
      "zzz",
      "courier:recent-searches",
    ])

    forgetMetricaStorage(kept)

    expect(kept.kept).toEqual([
      "theme",
      "courier:analytics-consent",
      "zzz",
      "courier:recent-searches",
    ])
  })

  it("is left alone where the page may not use storage", () => {
    expect(() => forgetMetricaStorage(undefined)).not.toThrow()
  })
})
