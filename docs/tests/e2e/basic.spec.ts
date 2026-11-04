/**
 * Basic requests: the page lists the users as it loads, a click creates
 * one through the proxy — handing the browser the visitor's cookie — and
 * the list fetched again holds it; a held query runs on its click.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"

test("lists the users, creates one, and finds it in the list fetched again", async ({
  page,
  context,
}) => {
  const listed = answerTo(page, "api.users.getAll")
  await page.goto("/docs/examples/basic")
  expect((await listed).status()).toBe(200)
  const list = sandbox(page, 'q.users.useQuery("getAll")')
  await expect(list).toContainText("Alice Johnson")
  await expect(list).not.toContainText("Jane Doe")

  const created = answerTo(page, "api.users.create")
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

  const again = answerTo(page, "api.users.getAll")
  await list.getByRole("button", { name: "Fetch again" }).click()
  expect((await again).status()).toBe(200)
  await expect(list).toContainText("Jane Doe")
})

test("holds a query until its button runs it", async ({ page }) => {
  await page.goto("/docs/examples/basic")
  const held = sandbox(page, 'q.users.useQuery("getById", { enabled: false })')
  await expect(held).toContainText("run the request to see the response")
  const fetched = answerTo(page, "api.users.getById")
  await held.getByRole("button", { name: "Get user #1" }).click()
  expect((await fetched).status()).toBe(200)
  await expect(held).toContainText("alice@example.com")
})
