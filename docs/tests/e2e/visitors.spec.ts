/**
 * Each visitor's data is their own on the site itself: what one visitor
 * creates through a page, another visitor's page does not list, and a
 * visitor who has changed nothing reads the examples' first data.
 */
import { answerTo, expect, sandbox, test, visitorContext } from "./support/fixtures"

test("keeps the user one visitor creates from another visitor's list", async ({
  page,
  browser,
  siteAccess,
}) => {
  await page.goto("/docs/examples/basic")
  const created = answerTo(page, "api.users.create")
  await sandbox(page, 'q.users.useMutation("create")')
    .getByRole("button", { name: "Create user" })
    .click()
  expect((await created).status()).toBe(201)
  const mine = sandbox(page, 'q.users.useQuery("getAll")')
  await mine.getByRole("button", { name: "Fetch again" }).click()
  await expect(mine).toContainText("Jane Doe")

  const other = await visitorContext(browser, siteAccess)
  try {
    const theirs = await other.newPage()
    const listed = answerTo(theirs, "api.users.getAll")
    await theirs.goto("/docs/examples/basic")
    expect((await listed).status()).toBe(200)
    const list = sandbox(theirs, 'q.users.useQuery("getAll")')
    await expect(list).toContainText("Carol Williams")
    await expect(list).not.toContainText("Jane Doe")
    expect((await other.cookies()).map((cookie) => cookie.name)).not.toContain(
      "__Host-courier-demo"
    )
  } finally {
    await other.close()
  }
})
