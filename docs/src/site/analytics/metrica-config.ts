/** The site's Yandex Metrica counter. */
export const METRICA_COUNTER = 113701816

/**
 * The counter's code, at the address the counter's own snippet gives:
 * built for this counter, with its settings inside (`ssr`). Metrica serves
 * the same code from `mc.yandex.ru`, but a request there carries the
 * cookies the reader's browser keeps for Yandex's other services; this
 * domain holds only the counter's own.
 */
export const METRICA_TAG = `https://mc.webvisor.org/metrika/tag_ww.js?id=${METRICA_COUNTER}`

/**
 * How the counter starts. The site sends every page view itself
 * (`defer`), the first among them: the App Router changes pages without
 * loading them, and the counter would count only the first. It records no
 * sessions (`webvisor`), no clicks for maps (`clickmap`), no anchors as
 * pages (`trackHash`), nothing in frames and no purchases, and runs no tag
 * manager (`disableYtm`): what the reader agreed to is counting visits,
 * not watching them. `clickmap`, `trackLinks` and `accurateTrackBounce`
 * are on unless set, so each is written out.
 */
export const METRICA_OPTIONS = {
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
} as const
