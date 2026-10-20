import { METRICA_COUNTER, METRICA_OPTIONS } from "./metrica-config"

/** Metrica's command function: it queues calls until the counter's code loads, then runs them. */
export interface Ym {
  (counter: number, method: string, ...args: unknown[]): void
  /** The calls queued before the counter's code loaded, each as its arguments object. */
  a?: IArguments[]
  /** When the queue was put in place, in milliseconds since the epoch. */
  l?: number
}

declare global {
  interface Window {
    /** Yandex Metrica's command function, once the site starts the counter. */
    ym?: Ym
  }
}

/** The window as Metrica uses it: its command function. */
export interface MetricaWindow {
  ym?: Ym
}

/* The window's flag that stops the counter, which its code reads before it sends anything. */
const STOP_FLAG = `disableYaCounter${METRICA_COUNTER}`

/** A page view, as Metrica records it. */
export interface PageView {
  /** The page's address, whole. */
  url: string
  title: string
  /** The address the reader came from: the previous page, or the site that linked here. */
  referer: string
}

/**
 * Puts Metrica's command queue on the window, as the counter's own snippet
 * does, unless it is there already: calls made before the counter's code
 * loads wait in it, and the code runs them as it starts.
 *
 * @param win - The window
 * @param now - The time now, in milliseconds since the epoch
 * @returns The command function
 * @example
 * ```ts
 * metricaQueue(window, Date.now())(METRICA_COUNTER, "init", METRICA_OPTIONS)
 * ```
 */
export function metricaQueue(win: MetricaWindow, now: number): Ym {
  if (win.ym) return win.ym
  const ym: Ym = function queued() {
    ym.a ??= []
    // biome-ignore lint/complexity/noArguments: the counter's code reads each queued call as its arguments object, as Metrica's own snippet queues it
    ym.a.push(arguments)
  }
  ym.l = now
  win.ym = ym
  return ym
}

/**
 * Starts the site's counter: it waits for its code to load, and counts
 * nothing until the site sends a page view.
 *
 * @param win - The window
 * @param now - The time now, in milliseconds since the epoch
 * @example
 * ```ts
 * startMetrica(window, Date.now())
 * ```
 */
export function startMetrica(win: MetricaWindow, now: number): void {
  Reflect.set(win, STOP_FLAG, false)
  metricaQueue(win, now)(METRICA_COUNTER, "init", METRICA_OPTIONS)
}

/**
 * Counts a page view.
 *
 * @param win - The window
 * @param view - The page, its title, and where the reader came from
 * @example
 * ```ts
 * countPageView(window, { url: location.href, title: document.title, referer: document.referrer })
 * ```
 */
export function countPageView(win: MetricaWindow, { url, title, referer }: PageView): void {
  win.ym?.(METRICA_COUNTER, "hit", url, { title, referer })
}

/**
 * Stops the counter on this page, in both ways Metrica documents: the
 * loaded counter is taken down (`destruct`), and the flag its code reads
 * before it sets a cookie or sends anything is raised — set before the
 * counter starts as well, it keeps it from ever starting.
 *
 * @param win - The window
 * @example
 * ```ts
 * stopMetrica(window)
 * ```
 */
export function stopMetrica(win: MetricaWindow): void {
  win.ym?.(METRICA_COUNTER, "destruct")
  Reflect.set(win, STOP_FLAG, true)
}
