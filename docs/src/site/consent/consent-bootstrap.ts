import {
  CONSENT_CLOCK_SKEW_MS,
  CONSENT_KEY,
  CONSENT_MAX_AGE_MS,
  CONSENT_VERSION,
} from "./consent-config"

/**
 * The attribute the page's root element carries while the consent bar is
 * up: the bar shows by it, and the page makes room for the bar by it.
 */
export const CONSENT_BAR_ATTRIBUTE = "data-consent-bar"

/**
 * The script that decides, before the page is first drawn, whether the
 * consent bar is up — by the same rules the consent store applies once the
 * page's own code runs: no answer that holds, and a browser that has not
 * asked sites not to track. The bar is in every page's HTML, the same for
 * every reader, so the page can be cached; this decides whether it shows,
 * so a reader who has to answer sees the question at once, not seconds
 * later under a finger already on its way to the page.
 *
 * @returns The script, as the text of an inline `<script>`
 * @example
 * ```tsx
 * <script dangerouslySetInnerHTML={{ __html: consentBootstrap() }} />
 * ```
 */
export function consentBootstrap(): string {
  return `(function(){try{var n=navigator;if(n.globalPrivacyControl===true||n.doNotTrack==="1")return;var r=JSON.parse(localStorage.getItem(${JSON.stringify(
    CONSENT_KEY
  )})||"null");if(r&&r.version===${CONSENT_VERSION}&&(r.choice==="granted"||r.choice==="denied")&&typeof r.decided==="number"&&isFinite(r.decided)){var a=Date.now()-r.decided;if(a<=${CONSENT_MAX_AGE_MS}&&a>=-${CONSENT_CLOCK_SKEW_MS})return}}catch(e){}document.documentElement.setAttribute(${JSON.stringify(
    CONSENT_BAR_ATTRIBUTE
  )},"")})()`
}
