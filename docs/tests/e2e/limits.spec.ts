/**
 * The site's limit on each visitor, behind the chain production has: the
 * DDoS filter, then Traefik, then the site. Visitors who come through the
 * same edge of the filter are counted apart; one who claims other
 * addresses — in `X-Forwarded-For` or in the filter's own header — is
 * counted by their own all the same; and one who goes around the filter
 * cannot pass for a visitor who came through it. Run on the local stand
 * alone: on a deployed site it would spend the budget of the address it
 * runs from.
 */
import type { Page } from "@playwright/test"

import { DEPLOYED, expect, openVisitor, test, visitorContext } from "./support/fixtures"
import { visitorAddress } from "./support/stand"

test.skip(DEPLOYED, "spends a minute's writes of the address it runs from")

/* Writes tried before one must be refused: twice the budget. Even at a write a second, the budget
   lets only 13 back in by the 40th. */
const MOST_WRITES = 40

/* A write through the proxy route from the page itself, claiming an address if given: its status
   and its Retry-After. */
function write(page: Page, claimed?: string): Promise<[number, string | null]> {
  return page.evaluate(async (address) => {
    const response = await fetch("/api/request?_s=api&_g=users&_m=create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(address !== undefined && { "x-forwarded-for": address, "ddg-connecting-ip": address }),
      },
      body: JSON.stringify({
        variables: { name: "Jane Doe", email: "jane@example.com" },
        options: {},
      }),
    })
    return [response.status, response.headers.get("retry-after")] as [number, string | null]
  }, claimed)
}

test("counts each visitor behind the filter on their own, whatever address they claim", async ({
  browser,
  siteAccess,
}, testInfo) => {
  /* Addresses of this worker's own, past the workers' own: a run's limits start empty. */
  const first = 100 + 3 * testInfo.workerIndex
  const networks = [
    await openVisitor(first),
    await openVisitor(first + 1),
    await openVisitor(first + 2, "direct"),
  ]
  const contexts = await Promise.all(
    networks.map((network) => visitorContext(browser, siteAccess, network))
  )
  try {
    const [hasty, calm, around] = await Promise.all(contexts.map((context) => context.newPage()))
    if (hasty === undefined || calm === undefined || around === undefined) {
      throw new Error("No page opened")
    }
    await Promise.all([hasty, calm, around].map((page) => page.goto("/docs/examples/basic")))
    /* Writes until one is refused, each claiming an address of its own. The budget lets a write
       back in every 3 s of its minute's 20, so how many go through first depends on how fast
       they go: at least the 20, then the refusal, which only counting the visitor's own gives. */
    const statuses: number[] = []
    let refusal: [number, string | null] | undefined
    for (let call = 0; call < MOST_WRITES && refusal === undefined; call += 1) {
      const answer = await write(hasty, `192.0.2.${call + 1}`)
      if (answer[0] === 429) refusal = answer
      else statuses.push(answer[0])
    }
    expect(statuses.length).toBeGreaterThanOrEqual(20)
    expect(new Set(statuses)).toEqual(new Set([201]))
    expect(refusal?.[0]).toBe(429)
    expect(Number(refusal?.[1])).toBeGreaterThan(0)

    expect((await write(calm))[0]).toBe(201)
    expect((await write(around, visitorAddress(first)))[0]).toBe(201)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    await Promise.all(networks.map((network) => network.close()))
  }
})
