/**
 * Server-side calls: the direct page renders what its calls answered on
 * the server, and its browser sends nothing to the proxy; the Server
 * Actions page creates a user and deletes one with the visitor's session,
 * which the action hands the browser, and the list rendered again on the
 * server holds the change — still there once the page is loaded again.
 */
import { expect, sandbox, test } from "./support/fixtures"

test("renders the direct page's answers on the server, with no call from the browser", async ({
  page,
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
  expect(proxied).toEqual([])
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
