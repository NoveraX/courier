/**
 * CRUD: a user created, replaced, changed in part and deleted through the
 * proxy, each answer as its verb gives it, the list fetched again after
 * each holding what the call made of it. The inspector shows each change
 * with its verb and path at the API, then the list fetched again.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest, proxyTimings } from "./support/inspector"

test("creates a user, replaces it, changes it in part, and deletes it", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  const listed = answerTo(page, "api.users.getAll")
  await page.goto("/docs/examples/crud")
  expect((await listed).status()).toBe(200)
  const crud = sandbox(page, "q.users — create · update · patch · remove")
  const users = crud.getByRole("list", { name: "Users" })
  const requests = inspectorOf(crud)
  await expect(users).toContainText("Carol Williams")

  const created = answerTo(page, "api.users.create")
  const listedAgain = answerTo(page, "api.users.getAll")
  await crud.getByRole("button", { name: "Create user" }).click()
  expect((await created).status()).toBe(201)
  expect((await listedAgain).status()).toBe(200)
  await expect(requests).toContainText("POST /users → 201")
  await expect(newestRequest(requests)).toContainText("GET /users → 200")
  const newUser = users.getByRole("listitem").filter({ hasText: /^User / })
  await expect(newUser).toHaveCount(1)
  const name = (await newUser.locator("span.font-medium").textContent()) ?? ""

  await crud.getByRole("button", { name: `Edit ${name}` }).click()
  const replaced = answerTo(page, "api.users.update")
  await crud.getByRole("button", { name: /^PUT #\d+$/ }).click()
  expect((await replaced).status()).toBe(200)
  await expect(users.getByRole("listitem").filter({ hasText: `${name} (updated)` })).toContainText(
    "moderator"
  )
  await expect(requests).toContainText(/PUT \/users\/\d+ → 200/)

  await crud.getByRole("button", { name: `Edit ${name} (updated)` }).click()
  const changed = answerTo(page, "api.users.patch")
  await crud.getByRole("button", { name: /^PATCH #\d+$/ }).click()
  expect((await changed).status()).toBe(200)
  await expect(users).toContainText(`${name} (updated) (patched)`)
  await expect(requests).toContainText(/PATCH \/users\/\d+ → 200/)

  const removed = answerTo(page, "api.users.remove")
  await crud.getByRole("button", { name: `Delete ${name} (updated) (patched)` }).click()
  expect((await removed).status()).toBe(204)
  await expect(users.getByRole("listitem").filter({ hasText: name })).toHaveCount(0)
  await expect(users).toContainText("Carol Williams")
  await expect(requests).toContainText(/DELETE \/users\/\d+ → 204/)
  await expectNoSecrets(page, context, timings)
})
