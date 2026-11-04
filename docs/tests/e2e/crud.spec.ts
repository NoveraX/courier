/**
 * CRUD: a user created, replaced, changed in part and deleted through the
 * proxy, each answer as its verb gives it, the list fetched again after
 * each holding what the call made of it.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"

test("creates a user, replaces it, changes it in part, and deletes it", async ({ page }) => {
  const listed = answerTo(page, "api.users.getAll")
  await page.goto("/docs/examples/crud")
  expect((await listed).status()).toBe(200)
  const crud = sandbox(page, "q.users — create · update · patch · remove")
  await expect(crud).toContainText("Carol Williams")

  const created = answerTo(page, "api.users.create")
  await crud.getByRole("button", { name: "Create user" }).click()
  expect((await created).status()).toBe(201)
  const newUser = crud.getByRole("listitem").filter({ hasText: /^User / })
  await expect(newUser).toHaveCount(1)
  const name = (await newUser.locator("span.font-medium").textContent()) ?? ""

  await crud.getByRole("button", { name: `Edit ${name}` }).click()
  const replaced = answerTo(page, "api.users.update")
  await crud.getByRole("button", { name: /^PUT #\d+$/ }).click()
  expect((await replaced).status()).toBe(200)
  await expect(crud.getByRole("listitem").filter({ hasText: `${name} (updated)` })).toContainText(
    "moderator"
  )

  await crud.getByRole("button", { name: `Edit ${name} (updated)` }).click()
  const changed = answerTo(page, "api.users.patch")
  await crud.getByRole("button", { name: /^PATCH #\d+$/ }).click()
  expect((await changed).status()).toBe(200)
  await expect(crud).toContainText(`${name} (updated) (patched)`)

  const removed = answerTo(page, "api.users.remove")
  await crud.getByRole("button", { name: `Delete ${name} (updated) (patched)` }).click()
  expect((await removed).status()).toBe(204)
  await expect(crud.getByRole("listitem").filter({ hasText: name })).toHaveCount(0)
  await expect(crud).toContainText("Carol Williams")
})
