/**
 * Request options, as the site's server carries them out: a timeout the
 * server keeps on its request to the API, with one more attempt when the
 * first is late; a retry on a 503, each attempt sent a fixed wait after
 * the last; and a read the server's cache answers the second time without
 * calling the API. The inspector shows each attempt, when it was sent and
 * how it ended, and what the cache made of each read.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest, proxyTimings } from "./support/inspector"

test("gives up on a late API on the server, after one more attempt", async ({ page, context }) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/options")
  const late = sandbox(page, "caller.misc.slowRetried()")
  const answer = answerTo(page, "api.misc.slowRetried")
  await late.getByRole("button", { name: "Fetch /slow on a timer" }).click()
  expect((await answer).status()).toBe(504)
  await expect(late).toContainText("504")
  await expect(newestRequest(inspectorOf(late))).toContainText(
    "API (demo): GET /slow → timed out after 1.0 s, the last of 2 attempts"
  )
  await expectNoSecrets(page, context, timings)
})

test("asks again on a 503, a fixed wait after each attempt", async ({ page }) => {
  await page.goto("/docs/examples/options")
  const flaky = sandbox(page, "caller.misc.flaky({ code: 503 })")
  const answer = answerTo(page, "api.misc.flaky")
  await flaky.getByRole("button", { name: "Fetch a 503" }).click()
  expect((await answer).status()).toBe(503)
  const told = newestRequest(inspectorOf(flaky))
  await expect(told).toContainText("GET /error/503 → 503")
  await expect(told).toContainText("the last of 3 attempts")
  const sent = await told.getByRole("definition").filter({ hasText: "sent at +" }).allTextContents()
  const at = sent.map((line) => Number(/sent at \+(\d+(?:\.\d+)?) (ms|s)/.exec(line)?.[1]))
  expect(at).toHaveLength(3)
  expect((at[1] ?? 0) - (at[0] ?? 0)).toBeGreaterThanOrEqual(290)
})

test("answers a read from the server's cache the second time, without the API", async ({
  page,
}) => {
  await page.goto("/docs/examples/options")
  const cached = sandbox(page, "caller.posts.cached()")
  const read = cached.getByRole("button", { name: "Read the posts" })
  const first = answerTo(page, "api.posts.cached")
  await read.click()
  expect((await first).status()).toBe(200)
  const stored = newestRequest(inspectorOf(cached))
  await expect(stored).toContainText("API (demo): GET /posts → 200")
  await expect(stored).toContainText("store 30000")
  const second = answerTo(page, "api.posts.cached")
  await read.click()
  expect((await second).status()).toBe(200)
  await expect(newestRequest(inspectorOf(cached))).toContainText("answered from the server's cache")
})
