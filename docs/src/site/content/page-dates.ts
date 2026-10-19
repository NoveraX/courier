const PAGE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const SHOWN = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/**
 * Whether a value is a page's date as its metadata writes it: a day of
 * the calendar, `YYYY-MM-DD`.
 *
 * @param value - The value
 * @returns Whether it names a real day
 * @example
 * ```ts
 * isPageDate("2026-10-14") // true
 * isPageDate("2026-02-30") // false
 * ```
 */
export function isPageDate(value: unknown): value is string {
  if (typeof value !== "string") return false
  const parts = PAGE_DATE.exec(value)
  if (!parts) return false
  const day = new Date(`${value}T00:00:00Z`)
  return day.getUTCDate() === Number(parts[3]) && day.getUTCMonth() + 1 === Number(parts[2])
}

/**
 * A page's date as a reader sees it.
 *
 * @param date - The date, `YYYY-MM-DD`
 * @returns The date in words
 * @example
 * ```ts
 * formatPageDate("2026-10-14") // "Oct 14, 2026"
 * ```
 */
export function formatPageDate(date: string): string {
  return SHOWN.format(new Date(`${date}T00:00:00Z`))
}

/**
 * The latest of some pages' dates — when a page made of them last changed.
 *
 * @param dates - The dates, `YYYY-MM-DD`; a page without one is left out
 * @returns The latest, or `undefined` when none is given
 * @example
 * ```ts
 * latestPageDate(["2026-10-05", "2026-10-14", undefined]) // "2026-10-14"
 * ```
 */
export function latestPageDate(dates: readonly (string | undefined)[]): string | undefined {
  return dates.filter(isPageDate).sort().at(-1)
}
