/**
 * Server-side calls: the direct page renders what its calls answered on
 * the server, and its browser sends nothing to the proxy; the Server
 * Actions page creates a user and deletes one with the visitor's session,
 * which the action hands the browser, and the list rendered again on the
 * server holds the change — still there once the page is loaded again. An
 * example page another site loads as anything but a page is not rendered,
 * so it calls the backend on no visitor's budget.
 */
import { expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest } from "./support/inspector"

test("refuses an example page another site loads as an image, a script, a frame or a fetch, and opens one it links to", async ({
  page,
}) => {
  /* What a browser sends for a load another site's page makes, as the page loads it. */
  const loadAs = (mode: string, dest: string) =>
    page.request.get("/docs/examples/direct", {
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": mode, "sec-fetch-dest": dest },
    })
  await page.goto("/")
  for (const dest of ["image", "script", "iframe", "empty"]) {
    expect((await loadAs("no-cors", dest)).status(), dest).toBe(403)
  }
  expect((await loadAs("navigate", "document")).status()).toBe(200)
})

test("renders the direct page's answers on the server, with no call from the browser", async ({
  page,
  context,
}) => {
  const proxied: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/request") proxied.push(request.url())
  })
  const response = await page.goto("/docs/examples/direct")
  expect(response?.status()).toBe(200)
  await expect(sandbox(page, "caller.users.getAll()")).toContainText("Carol Williams")
  await expect(sandbox(page, "caller.users.getById({ id: 1 })")).toContainText("alice@example.com")
  await expect(sandbox(page, "caller.posts.getAll()")).toContainText("Proxy Mode vs Direct Mode")
  const traced = sandbox(page, "caller.users.getAll()").getByRole("region", {
    name: "The call on the server",
  })
  await expect(traced).toContainText(
    "on the server, as the page rendered → API (demo): GET /users → 200"
  )
  await expect(traced).toContainText("x-visitor-address")
  await expect(page.getByRole("status").filter({ hasText: "/api/request" })).toContainText(
    "sent 0 requests"
  )
  expect(proxied).toEqual([])
  await expectNoSecrets(page, context)
})

test("creates a user with a Server Action and deletes it, the list rendered again holding each change", async ({
  page,
  context,
}) => {
  await page.goto("/docs/examples/actions")
  const list = page.getByRole("list").filter({ hasText: "alice@example.com" })
  await expect(list).toContainText("Bob Smith")

  const form = sandbox(page, "createUser — a Server Action")
  await form.getByLabel("name", { exact: true }).fill("Grace Hopper")
  await form.getByLabel("email", { exact: true }).fill("grace@example.com")
  await form.getByLabel("role", { exact: true }).selectOption("admin")
  await form.getByRole("button", { name: "Create" }).click()
  await expect(form).toContainText("grace@example.com")
  await expect(list).toContainText("Grace Hopper")
  await expect(form.getByRole("region", { name: "The call on the server" })).toContainText(
    "in a Server Action → API (demo): POST /users → 201"
  )
  await expect(newestRequest(inspectorOf(form))).toContainText(
    "browser → Server Action (POST /docs/examples/actions)"
  )
  const rendered = page
    .getByRole("region", { name: "The call on the server" })
    .filter({ hasText: "as the page rendered" })
  await expect(rendered).toContainText("API (demo): GET /users → 200")
  await expectNoSecrets(page, context)
  expect(await context.cookies()).toContainEqual(
    expect.objectContaining({ name: "__Host-courier-demo", secure: true, httpOnly: true })
  )

  await page.reload()
  await expect(list).toContainText("Grace Hopper")
  await list.getByRole("button", { name: "Delete Grace Hopper" }).click()
  await expect(list).not.toContainText("Grace Hopper")
  await page.reload()
  await expect(list).toContainText("Bob Smith")
  await expect(list).not.toContainText("Grace Hopper")
})
