/**
 * Encoding and uploads: the same variables sent as JSON and as a form, an
 * array written into the query, the defaults a source adds to every call,
 * and a file uploaded with and without progress — the backend answering
 * with what reached it, the bytes of a body as they came — or refused past
 * the example's limit by the site's server, which then calls no API. Each
 * sandbox's inspector shows the address the site's server asked the API
 * for.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest, proxyTimings } from "./support/inspector"

test("sends a body as JSON and URL-encoded, arrays in the query, and the source's defaults", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/encoding")

  const bodies = sandbox(page, "echo.send — two body encodings")
  const json = answerTo(page, "api.echo.send")
  await bodies.getByRole("button", { name: "JSON (default)" }).click()
  expect((await json).status()).toBe(200)
  await expect(bodies).toContainText("application/json")
  await expect(bodies).toContainText('"rawBody": "{\\"name\\":\\"John\\",\\"role\\":\\"admin\\"}"')
  await expect(newestRequest(inspectorOf(bodies))).toContainText("API (demo): POST /echo → 200")
  const form = answerTo(page, "encodedApi.echo.send")
  await bodies.getByRole("button", { name: "URL-encoded" }).click()
  expect((await form).status()).toBe(200)
  await expect(bodies).toContainText("application/x-www-form-urlencoded")
  await expect(bodies).toContainText('"rawBody": "apiVersion=v2&name=John&role=admin"')
  await expect(newestRequest(inspectorOf(bodies))).toContainText("POST /echo?format=json → 200")

  const arrays = sandbox(page, "echo.retrieve — arrays in the query")
  const query = answerTo(page, "encodedApi.echo.retrieve")
  await arrays.getByRole("button", { name: "Fetch with arrays" }).click()
  expect((await query).status()).toBe(200)
  await expect(arrays).toContainText("tags%5B%5D=javascript&tags%5B%5D=react")
  await expect(newestRequest(inspectorOf(arrays))).toContainText("tags%5B%5D=javascript")

  const defaults = sandbox(page, "echo — defaultBody · defaultQueryParams")
  const posted = answerTo(page, "encodedApi.echo.send")
  await defaults.getByRole("button", { name: "POST (defaultBody)" }).click()
  expect((await posted).status()).toBe(200)
  await expect(defaults).toContainText("apiVersion")
  const got = answerTo(page, "encodedApi.echo.retrieve")
  await defaults.getByRole("button", { name: "GET (defaultQueryParams)" }).click()
  expect((await got).status()).toBe(200)
  await expect(defaults).toContainText("format=json")
  await expect(newestRequest(inspectorOf(defaults))).toContainText("GET /echo?format=json")
  await expect(inspectorOf(arrays)).not.toContainText("POST /echo")
  await expectNoSecrets(page, context, timings)
})

const notes = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.alloc(2048, "x") }

test("uploads a file, with progress too, and names the limit on the page", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/upload")

  const simple = sandbox(page, "caller.files.upload")
  await expect(simple).toContainText("up to 1.0 MB")
  await simple.locator("input[type=file]").setInputFiles(notes)
  const uploaded = answerTo(page, "api.files.upload")
  await simple.getByRole("button", { name: "Upload", exact: true }).click()
  expect((await uploaded).status()).toBe(200)
  await expect(simple).toContainText('"size": 2048')
  await expect(simple).toContainText("Uploaded from the Courier docs")
  const sent = newestRequest(inspectorOf(simple))
  await expect(sent).toContainText("API (demo): POST /upload → 200")
  await expect(sent).toContainText("multipart/form-data")

  const progress = sandbox(page, "caller.files.with({ onUploadProgress }).upload")
  await progress.locator("input[type=file]").setInputFiles(notes)
  const reported = answerTo(page, "api.files.upload")
  await progress.getByRole("button", { name: "Upload with progress" }).click()
  expect((await reported).status()).toBe(200)
  await expect(progress).toContainText('"originalName": "notes.txt"')
  await expect(newestRequest(inspectorOf(progress))).toContainText("POST /upload → 200")
  await expectNoSecrets(page, context, timings)
})

test("refuses a file past the example's limit before the backend reads it", async ({ page }) => {
  await page.goto("/docs/examples/upload")
  const simple = sandbox(page, "caller.files.upload")
  await simple.locator("input[type=file]").setInputFiles({
    name: "large.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(1100 * 1024),
  })
  const refused = answerTo(page, "api.files.upload")
  await simple.getByRole("button", { name: "Upload", exact: true }).click()
  expect((await refused).status()).toBe(413)
  await expect(simple).toContainText("failed")
  await expect(newestRequest(inspectorOf(simple))).toContainText("413")
})

test("sends one over the limit, which the site's server refuses without calling the API", async ({
  page,
}) => {
  await page.goto("/docs/examples/upload")
  const simple = sandbox(page, "caller.files.upload")
  const refused = answerTo(page, "api.files.upload")
  await simple.getByRole("button", { name: "Send one over the limit" }).click()
  expect((await refused).status()).toBe(413)
  await expect(newestRequest(inspectorOf(simple))).toContainText(
    "the site's server answered 413 without calling the API"
  )
})
