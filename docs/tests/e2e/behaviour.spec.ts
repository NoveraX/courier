/**
 * How a call behaves rather than what it holds: an error of the code a
 * page asks for, caught as an HTTPError; middleware around the calls of
 * its own source; a slow call cancelled, shared, and cancelled by the
 * next; a timeout; a stream read to its end; a raw answer; and the typed
 * singleton's page, which calls nothing.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest, proxyTimings } from "./support/inspector"

test("answers each error a page asks for, caught as an HTTPError", async ({ page }) => {
  await page.goto("/docs/examples/errors")
  const caught = sandbox(page, "caller.misc.error({ code })")
  await caught.getByLabel("code", { exact: true }).selectOption("422")
  const answer = answerTo(page, "api.misc.error")
  await caught.getByRole("button", { name: "Trigger a 422" }).click()
  expect((await answer).status()).toBe(422)
  await expect(caught).toContainText('"name": "HTTPError"')
  await expect(caught).toContainText("Intentional 422 error")

  const guard = sandbox(page, "isHTTPError(error)")
  const forbidden = answerTo(page, "api.misc.error")
  await guard.getByRole("button", { name: "Trigger a 403" }).click()
  expect((await forbidden).status()).toBe(403)
  await expect(guard).toContainText('"isHttpError": true')
})

test("runs the middleware source's chain link by link, its error caught past it", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/middleware")
  await expect(page.getByText("Check your server terminal")).toHaveCount(0)
  const users = sandbox(page, 'middlewareQ.users.useQuery("getAll")')
  const listed = answerTo(page, "middlewareApi.users.getAll")
  await users.getByRole("button", { name: "Fetch users" }).click()
  expect((await listed).status()).toBe(200)
  await expect(users).toContainText("Alice Johnson")
  await expect(users).toContainText('"_meta"')
  const chain = newestRequest(inspectorOf(users)).getByRole("list").filter({ hasText: "stamp" })
  await expect(chain.getByRole("listitem")).toHaveText([
    /^log · wrap · /,
    /^auth · wrap · .* · added authorization$/,
    /^stamp · after · /,
    /^failures · wrap · /,
  ])
  await expect(inspectorOf(users)).toContainText(/middlewareApi:users:getAll → 200 \(\d+ms\)/)

  const failing = sandbox(page, "middlewareCaller.misc.error({ code: 500 })")
  const failed = answerTo(page, "middlewareApi.misc.error")
  await failing.getByRole("button", { name: "Trigger a 500" }).click()
  expect((await failed).status()).toBe(500)
  await expect(failing).toContainText("Caught here, after the server's middleware ran")
  const told = newestRequest(inspectorOf(failing))
  await expect(told).toContainText("[middlewareApi] misc.error failed: 500")
  await expect(told).toContainText("GET /error/500 → 500")
  await expectNoSecrets(page, context, timings)
  for (const said of [...timings, ...(await inspectorOf(users).allTextContents())]) {
    expect(said).not.toContain("made-up-docs-token")
  }
})

test("cancels a slow call, shares three reads, and cancels a call with the next", async ({
  page,
}) => {
  await page.goto("/docs/examples/abort")
  const manual = sandbox(page, "caller.misc.with({ signal }).slow()")
  const started = page.waitForRequest((request) => request.url().includes("_m=slow"))
  await manual.getByRole("button", { name: "Start a slow request" }).click()
  await started
  await manual.getByRole("button", { name: "Cancel" }).click()
  await expect(manual).toContainText("Aborted: Cancel stopped the request")

  const shared = sandbox(page, "Promise.all([users.getAll(), users.getAll(), users.getAll()])")
  await shared.getByRole("button", { name: "Read the users three times" }).click()
  await expect(shared).toContainText('"calls": 3')
  await expect(shared).toContainText('"requests": 1')

  const previous = sandbox(page, "caller.misc.with({ cancelPrevious: true }).slow()")
  const again = previous.getByRole("button", { name: "Call, then call again" })
  await again.click()
  await expect(previous).toContainText("in flight 1")
  await again.click()
  await expect(previous).toContainText("cancelled 1")
  await expect(previous).toContainText("This response was delayed by 3 seconds")
  await expect(previous).toContainText("in flight 0")
})

test("times out a call that answers later than its timeout, and not one that answers sooner", async ({
  page,
}) => {
  await page.goto("/docs/examples/options")
  const timed = sandbox(page, "caller.misc.with({ timeout }).slow()")
  await timed.getByRole("button", { name: "Fetch /slow" }).click()
  await expect(timed).toContainText(/timed out/i)
  /* Given up at its timeout, well before the three seconds the endpoint takes to answer. */
  const waited = Number(/(\d+) ms/.exec((await timed.textContent()) ?? "")?.[1])
  expect(waited).toBeLessThan(2000)
  await timed.getByLabel("timeout (ms)", { exact: true }).selectOption("5000")
  const answered = answerTo(page, "api.misc.slow")
  await timed.getByRole("button", { name: "Fetch /slow" }).click()
  expect((await answered).status()).toBe(200)
  await expect(timed).toContainText("This response was delayed by 3 seconds")
})

test("reads a stream chunk by chunk to its end, each when it came", async ({ page, context }) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/streaming")
  const stream = sandbox(page, "caller.misc.with({ stream: true }).stream()")
  await stream.getByRole("button", { name: "Start the stream" }).click()
  await expect(stream).toContainText("complete · 5 chunks")
  await expect(stream).toContainText("#4endpoint!")
  const times = await stream
    .getByRole("list", { name: "Chunks" })
    .getByRole("listitem")
    .allTextContents()
  const at = times.map((chunk) => Number(/\+(\d+) ms$/.exec(chunk)?.[1]))
  expect(at).toHaveLength(5)
  for (const [index, ms] of at.entries()) {
    if (index > 0) expect(ms - (at[index - 1] ?? 0)).toBeGreaterThan(250)
  }
  await expect(newestRequest(inspectorOf(stream))).toContainText("API (demo): GET /stream → 200")
  await expectNoSecrets(page, context, timings)
})

test("answers a call as data, and as the raw answer with its status", async ({ page }) => {
  await page.goto("/docs/examples/raw-data")
  const plain = sandbox(page, "caller.users.getAll()")
  const data = answerTo(page, "api.users.getAll")
  await plain.getByRole("button", { name: "Fetch users" }).click()
  expect((await data).status()).toBe(200)
  await expect(plain).toContainText('"total": 3')

  const raw = sandbox(page, "caller.users.raw.getAll()")
  const answer = answerTo(page, "api.users.getAll")
  await raw.getByRole("button", { name: "Fetch users, raw" }).click()
  expect((await answer).status()).toBe(200)
  await expect(raw).toContainText('"status": 200')
  await expect(raw).toContainText("no-store")
  const passed = newestRequest(inspectorOf(raw))
  await expect(passed).toContainText("headers the API answered with")
  await expect(passed).toContainText("keep-alive")
  await expect(passed.getByRole("definition").last()).not.toContainText("keep-alive")
})

test("shows the typed singleton without calling anything", async ({ page }) => {
  const proxied: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/request") proxied.push(request.url())
  })
  const response = await page.goto("/docs/examples/singleton")
  expect(response?.status()).toBe(200)
  await expect(page.getByRole("heading", { name: "Multiple Instances" })).toBeVisible()
  expect(proxied).toEqual([])
})
