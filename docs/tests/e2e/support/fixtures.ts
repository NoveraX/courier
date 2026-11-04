import {
  type Browser,
  type BrowserContext,
  test as base,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test"

import { fromSetup, SITE_HOST, STAND, visitorAddress } from "./stand"
import { openVisitorNetwork, type VisitorNetwork } from "./visitor-network"

/** How a worker's browsers reach the site: its address, and the proxy they go through, if any. */
export interface SiteAccess {
  readonly baseURL: string
  readonly proxy?: string | undefined
}

/** Whether the examples run against a deployed site, which `SITE_URL` names. */
export const DEPLOYED = Boolean(process.env.SITE_URL)

/**
 * Open the network a visitor of their own reaches the site through, at an
 * address no worker has.
 *
 * @param index - Which such visitor, from 100 up: past the workers' own addresses
 * @returns The network
 */
export function openVisitor(index: number): Promise<VisitorNetwork> {
  return openVisitorNetwork({
    site: new URL(fromSetup(STAND.site)),
    host: SITE_HOST,
    address: visitorAddress(index),
    keyPath: fromSetup(STAND.key),
    certPath: fromSetup(STAND.cert),
  })
}

/**
 * A browser context for another visitor: their own cookies, reaching the
 * site as the worker's own browser does, or through a network of their own.
 *
 * @param browser - The browser
 * @param access - How the site is reached
 * @param network - A network of the visitor's own, at an address of theirs
 * @returns The context
 */
export function visitorContext(
  browser: Browser,
  access: SiteAccess,
  network?: VisitorNetwork
): Promise<BrowserContext> {
  const proxy = network?.proxy ?? access.proxy
  return browser.newContext({
    baseURL: access.baseURL,
    ...(proxy !== undefined && { proxy: { server: proxy }, ignoreHTTPSErrors: true }),
  })
}

/**
 * The tests of the live examples: each worker is one visitor, at an
 * address of its own, who opens the site by its name over HTTPS through a
 * front before the production server — or, with `SITE_URL`, the deployed
 * site itself.
 */
export const test = base.extend<object, { siteAccess: SiteAccess }>({
  siteAccess: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern, and this fixture has none
    async ({}, use, workerInfo) => {
      if (process.env.SITE_URL) {
        await use({ baseURL: process.env.SITE_URL })
        return
      }
      const network = await openVisitor(workerInfo.workerIndex)
      await use({ baseURL: `https://${SITE_HOST}`, proxy: network.proxy })
      await network.close()
    },
    { scope: "worker" },
  ],
  baseURL: async ({ siteAccess }, use) => use(siteAccess.baseURL),
  proxy: async ({ siteAccess }, use) =>
    use(siteAccess.proxy === undefined ? undefined : { server: siteAccess.proxy }),
  ignoreHTTPSErrors: async ({ siteAccess }, use) => use(siteAccess.proxy !== undefined),
})

export { expect } from "@playwright/test"

/**
 * A sandbox on an example's page, found by the call its header names.
 *
 * @param page - The page
 * @param label - The call, as the sandbox's header writes it
 * @returns The sandbox
 */
export function sandbox(page: Page, label: string): Locator {
  return page.getByRole("region", { name: label, exact: true })
}

/**
 * Wait for the answer to a page's call through the site's proxy route.
 *
 * @param page - The page
 * @param call - The source, group and endpoint, as `api.users.create`
 * @returns The answer, once the browser has it
 */
export function answerTo(page: Page, call: string): Promise<Response> {
  const [source, group, method] = call.split(".")
  const query = `_s=${source}&_g=${group}&_m=${method}`
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === "/api/request" && url.search.includes(query)
  })
}
