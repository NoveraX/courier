/**
 * Basic requests: the page lists the users as it loads, a click creates
 * one through the proxy — handing the browser the visitor's cookie — and
 * the list, fetched again on its own, holds it; a held query runs on its
 * click. Each sandbox's inspector shows its requests' way, both legs, as
 * the browser recorded it and the site's server told it — and no value of
 * a cookie, nor the visitor's address or the API's.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest, proxyTimings } from "./support/inspector"

test("lists the users, creates one, and finds it in the list fetched again", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  const listed = answerTo(page, "api.users.getAll")
  await page.goto("/docs/examples/basic")
  expect((await listed).status()).toBe(200)
  const list = sandbox(page, 'q.users.useQuery("getAll")')
  await expect(list).toContainText("Alice Johnson")
  await expect(list).not.toContainText("Jane Doe")
  const loaded = newestRequest(inspectorOf(list))
  await expect(loaded).toContainText("browser → /api/request → API (demo): GET /users → 200")
  await expect(loaded).toContainText("POST /api/request?_s=api&_g=users&_m=getAll")
  await expect(loaded).toContainText("X-Courier-Rid: req_")

  const created = answerTo(page, "api.users.create")
  const fetchedAgain = answerTo(page, "api.users.getAll")
  const create = sandbox(page, 'q.users.useMutation("create")')
  await create.getByRole("button", { name: "Create user" }).click()
  const answer = await created
  expect(answer.status()).toBe(201)
  await expect(create).toContainText("jane@example.com")
  expect(await context.cookies()).toContainEqual(
    expect.objectContaining({
      name: "__Host-courier-demo",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    })
  )

  expect((await fetchedAgain).status()).toBe(200)
  await expect(list).toContainText("Jane Doe")
  const made = inspectorOf(create)
  await expect(made).toContainText("POST /users → 201")
  await expect(newestRequest(made)).toContainText("GET /users → 200")
  await expect(made).toContainText("cookie(__Host-courier-demo)")
  await expectNoSecrets(page, context, timings)
})

test("links to the page's own code on GitHub", async ({ page }) => {
  await page.goto("/docs/examples/basic")
  await expect(page.getByRole("link", { name: "This page's code, on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/NoveraX/courier/tree/master/docs/src/app/docs/examples/basic"
  )
})

test("holds a query until its button runs it", async ({ page, context }) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/basic")
  const held = sandbox(page, 'q.users.useQuery("getById", { enabled: false })')
  await expect(held).toContainText("run the request to see the response")
  await expect(inspectorOf(held)).toContainText("no request yet")
  const fetched = answerTo(page, "api.users.getById")
  await held.getByRole("button", { name: "Get user #1" }).click()
  expect((await fetched).status()).toBe(200)
  await expect(held).toContainText("alice@example.com")
  await expect(newestRequest(inspectorOf(held))).toContainText("GET /users/1 → 200")
  await expectNoSecrets(page, context, timings)
})
