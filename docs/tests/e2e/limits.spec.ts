/**
 * The proxy route's limit on the site itself: a visitor's page that makes
 * more writes in a minute than a person would is answered 429 with when to
 * try again, while a visitor at another address is not held back. Run on
 * the local stand alone, with visitors at addresses no worker has: on a
 * deployed site it would spend the budget of the address it runs from.
 */
import { DEPLOYED, expect, openVisitor, test, visitorContext } from "./support/fixtures"

test.skip(DEPLOYED, "spends a minute's writes of the address it runs from")

/* A page's write through the proxy route, from the page itself: its status and its Retry-After. */
const WRITE = `async () => {
  const response = await fetch("/api/request?_s=api&_g=users&_m=create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variables: { name: "Jane Doe", email: "jane@example.com" }, options: {} }),
  })
  return [response.status, response.headers.get("retry-after")]
}`

test("answers a visitor past 20 writes a minute with 429, and not another", async ({
  browser,
  siteAccess,
}, testInfo) => {
  /* Addresses of this worker's own, past the workers' own: a run's limits start empty. */
  const busy = await openVisitor(100 + 2 * testInfo.workerIndex)
  const calm = await openVisitor(101 + 2 * testInfo.workerIndex)
  const contexts = [
    await visitorContext(browser, siteAccess, busy),
    await visitorContext(browser, siteAccess, calm),
  ]
  try {
    const [hasty, other] = await Promise.all(contexts.map((context) => context.newPage()))
    if (hasty === undefined || other === undefined) throw new Error("No page opened")
    await Promise.all([hasty, other].map((page) => page.goto("/docs/examples/basic")))
    const answers: Array<[number, string | null]> = []
    for (let write = 0; write < 21; write += 1) {
      answers.push(await hasty.evaluate(`(${WRITE})()`))
    }
    expect(answers.slice(0, 20).map(([status]) => status)).toEqual(Array(20).fill(201))
    const [status, retryAfter] = answers[20] ?? []
    expect(status).toBe(429)
    expect(Number(retryAfter)).toBeGreaterThan(0)
    expect(await other.evaluate(`(${WRITE})()`)).toEqual([201, null])
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    await Promise.all([busy.close(), calm.close()])
  }
})
