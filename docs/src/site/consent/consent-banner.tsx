"use client"

import type { RefObject } from "react"
import { useEffect, useId, useLayoutEffect, useRef } from "react"

import { CONSENT_PATH } from "@/site/legal/legal-paths"
import { SiteLink } from "@/site/mdx/site-link"
import { CONSENT_BAR_ATTRIBUTE } from "./consent-bootstrap"
import { decideConsent, useConsent } from "./use-consent"

/* The two answers look the same, so neither is the one a reader is steered to; asked again,
   the answer in force is lit and outlined, as plainly as text against the page. */
const ANSWER =
  "flex h-9 cursor-pointer items-center justify-center rounded-control border border-line bg-panel px-3.5 text-control font-medium text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg aria-pressed:border-fg-subtle aria-pressed:bg-raised aria-pressed:text-fg min-[640px]:h-7.5 pointer-coarse:h-9"

/* The bar's height, measured, so the page ends above it and no column that scrolls on its
   own lets focus slip under it. */
function useMeasuredHeight(bar: RefObject<HTMLElement | null>, shown: boolean): void {
  useEffect(() => {
    const element = bar.current
    if (!shown || !element) return
    const root = document.documentElement
    const measure = () =>
      root.style.setProperty(
        "--consent-bar",
        `${Math.ceil(element.getBoundingClientRect().height)}px`
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty("--consent-bar")
    }
  }, [bar, shown])
}

/**
 * Asks a reader whether the site may count their visits, until they
 * answer, and keeps the answer: a bar across the foot of the window, set
 * as the header is across its top — one sentence with the way to the
 * consent it asks for, and Deny and Accept alike. The bar is in every
 * page, the same for every reader; whether it shows is decided before the
 * page is first drawn, and kept in step with the answer once the page's
 * code runs. It takes focus only when the reader asks for it from Cookie
 * settings.
 *
 * @returns The question
 * @example
 * ```tsx
 * <ConsentBanner />
 * ```
 */
export function ConsentBanner() {
  const { known, choice, asking, asks } = useConsent()
  const region = useRef<HTMLElement>(null)
  const sentence = useId()
  const answered = choice !== undefined
  useLayoutEffect(() => {
    if (known) document.documentElement.toggleAttribute(CONSENT_BAR_ATTRIBUTE, asking)
  }, [known, asking])
  useEffect(() => {
    if (asks > 0 && asking) region.current?.focus()
  }, [asks, asking])
  useMeasuredHeight(region, known && asking)
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label="Analytics consent"
      aria-describedby={sentence}
      data-consent-banner=""
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-(--site-header) outline-none backdrop-blur-[14px] backdrop-saturate-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand print:hidden"
    >
      <div className="mx-auto flex max-w-[1520px] flex-col gap-3 px-6 py-3.5 min-[640px]:flex-row min-[640px]:items-center min-[640px]:gap-6 min-[640px]:py-2.75">
        <p id={sentence} className="m-0 flex-1 text-control leading-[1.55] text-fg-muted">
          This site counts visits with analytics cookies only if you accept.{" "}
          <SiteLink href={CONSENT_PATH}>Read the consent</SiteLink>
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-2 min-[640px]:flex">
          <button
            type="button"
            aria-pressed={answered ? choice === "denied" : undefined}
            onClick={() => decideConsent("denied")}
            className={ANSWER}
          >
            Deny
          </button>
          <button
            type="button"
            aria-pressed={answered ? choice === "granted" : undefined}
            onClick={() => decideConsent("granted")}
            className={ANSWER}
          >
            Accept
          </button>
        </div>
      </div>
    </section>
  )
}
