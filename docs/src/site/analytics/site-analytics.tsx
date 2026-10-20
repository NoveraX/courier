"use client"

import { usePathname, useSearchParams } from "next/navigation"
import Script from "next/script"
import { Suspense, useEffect, useRef, useState } from "react"

import { useConsent } from "@/site/consent/use-consent"
import { analyticsAllowed, currentPlace } from "./analytics-gate"
import { countPageView, startMetrica, stopMetrica } from "./metrica"
import { METRICA_TAG } from "./metrica-config"
import {
  type ForgettingStorage,
  forgetMetricaCookies,
  forgetMetricaStorage,
} from "./metrica-storage"

/* What the counter's code may still write as it winds down is cleared once more after it. */
const SWEEP_AGAIN_MS = 2000

/* Every page the reader opens, the first among them: the App Router changes pages without
   loading them, so the counter is told of each. A page is counted once its frame is drawn,
   with its own title by then, and only then becomes the page the next one came from. */
function PageViews() {
  const pathname = usePathname()
  const search = useSearchParams()
  const previous = useRef<string | undefined>(undefined)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a page change is what runs this; the address is read whole from the window, as the browser has it
  useEffect(() => {
    const { origin, pathname: path, search: query } = window.location
    const url = `${origin}${path}${query}`
    if (url === previous.current) return
    const frame = requestAnimationFrame(() => {
      const referer = previous.current ?? document.referrer
      previous.current = url
      countPageView(window, { url, title: document.title, referer })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname, search])
  return null
}

function browserStorage(kind: "localStorage" | "sessionStorage"): ForgettingStorage | undefined {
  try {
    return window[kind]
  } catch (error) {
    console.warn("Yandex Metrica's storage cannot be cleared: the browser blocks it", error)
    return undefined
  }
}

function sweep(): void {
  forgetMetricaCookies(document, window.location.hostname)
  forgetMetricaStorage(browserStorage("localStorage"))
  forgetMetricaStorage(browserStorage("sessionStorage"))
}

/**
 * Yandex Metrica, on the published site only, once the reader agrees:
 * its code loaded through `next/script` once the browser is idle, every
 * page view sent as the App Router changes pages. A reader who withdraws
 * — in this tab or another — stops the counter at once and has its
 * cookies and storage deleted; an answer that is anything but yes clears
 * what an earlier yes left behind. A yes given again on a page where the
 * counter was taken down loads the page again, for a counter started anew.
 *
 * @returns The counter's code and its page views, or nothing
 * @example
 * ```tsx
 * <SiteAnalytics />
 * ```
 */
export function SiteAnalytics() {
  const { known, choice } = useConsent()
  const [allowed, setAllowed] = useState(false)
  const [started, setStarted] = useState(false)
  const stage = useRef<"waiting" | "counting" | "stopped">("waiting")
  useEffect(() => setAllowed(analyticsAllowed(currentPlace())), [])
  const counting = allowed && choice === "granted"
  useEffect(() => {
    if (counting) {
      if (stage.current === "stopped") window.location.reload()
      if (stage.current !== "waiting") return
      startMetrica(window, Date.now())
      stage.current = "counting"
      setStarted(true)
      return
    }
    stopMetrica(window)
    if (stage.current === "counting") {
      stage.current = "stopped"
      setStarted(false)
      sweep()
      const again = window.setTimeout(sweep, SWEEP_AGAIN_MS)
      return () => window.clearTimeout(again)
    }
    if (known && choice !== "granted") sweep()
  }, [counting, known, choice])
  if (!counting || !started) return null
  return (
    <>
      <Script
        id="yandex-metrica"
        src={METRICA_TAG}
        strategy="lazyOnload"
        onError={(error) => console.warn("Yandex Metrica could not load", error)}
      />
      <Suspense fallback={null}>
        <PageViews />
      </Suspense>
    </>
  )
}
