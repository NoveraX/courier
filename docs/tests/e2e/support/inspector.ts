import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test"

import { DEPLOYED } from "./fixtures"
import { visitorAddress } from "./stand"

/**
 * A sandbox's inspector: the requests its calls made.
 *
 * @param sandbox - The sandbox
 * @returns The inspector
 */
export function inspectorOf(sandbox: Locator): Locator {
  return sandbox.getByRole("region", { name: "Requests" })
}

/**
 * The newest request an inspector shows: its line of words, and its legs, open.
 *
 * @param inspector - The inspector
 * @returns The request
 */
export function newestRequest(inspector: Locator): Locator {
  return inspector.getByRole("listitem").first()
}

/**
 * Keep every `Server-Timing` the site's proxy route answers the page with, from now on.
 *
 * @param page - The page
 * @returns The headers, as they come
 */
export function proxyTimings(page: Page): string[] {
  const seen: string[] = []
  page.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/api/request") return
    seen.push(response.headers()["server-timing"] ?? "")
  })
  return seen
}

/**
 * Expect the site's server to have told of each call, and nothing the
 * page's inspectors show — open or not — nor any `Server-Timing` the
 * route answered with, to hold a cookie's value, the visitor's address or
 * the API's own address.
 *
 * @param page - The page
 * @param context - The page's browser context, which holds its cookies
 * @param timings - The headers {@link proxyTimings} kept
 */
export async function expectNoSecrets(
  page: Page,
  context: BrowserContext,
  timings: readonly string[]
): Promise<void> {
  expect(timings.length).toBeGreaterThan(0)
  for (const timing of timings) expect(timing).toContain("rid;desc=")
  const shown = await page.getByRole("region", { name: "Requests" }).allTextContents()
  const said = [...shown, ...timings].join("\n")
  const cookies = (await context.cookies()).map((cookie) => cookie.value)
  const address = DEPLOYED ? [] : [visitorAddress(test.info().workerIndex)]
  for (const secret of [...cookies.filter((value) => value.length >= 8), ...address]) {
    expect(said).not.toContain(secret)
  }
  for (const own of ["127.0.0.1", "localhost", "://"]) expect(said).not.toContain(own)
}
