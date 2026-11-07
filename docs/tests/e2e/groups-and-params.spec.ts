/**
 * Request groups and path parameters: three queries of two groups load
 * with the page, each asking the API under its group's prefix; an id fills
 * a path, two ids a nested one — a post of another user being one the API
 * does not have — a page and a limit the query string, and a value with
 * the address's own characters is encoded in it. Each sandbox's inspector
 * shows the path the site's server asked the API for.
 */
import { answerTo, expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest, proxyTimings } from "./support/inspector"

test("loads the users, the posts and the first user, each from its group", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  const answers = ["api.users.getAll", "api.posts.getAll", "api.users.getById"].map((call) =>
    answerTo(page, call)
  )
  await page.goto("/docs/examples/groups")
  for (const answer of await Promise.all(answers)) expect(answer.status()).toBe(200)
  const groups = sandbox(page, "q.users · q.posts")
  await expect(groups).toContainText("Bob Smith")
  await expect(groups).toContainText("Getting Started with Courier")
  await expect(groups).toContainText("alice@example.com")
  const requests = inspectorOf(groups)
  for (const path of ["GET /users → 200", "GET /posts → 200", "GET /users/1 → 200"]) {
    await expect(requests).toContainText(path)
  }
  await expectNoSecrets(page, context, timings)
})

test("fills a path with an id, a nested one with two, and a query with a page", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/path-params")

  const byId = sandbox(page, "caller.users.getById")
  await byId.getByLabel("id", { exact: true }).selectOption("2")
  const user = answerTo(page, "api.users.getById")
  await byId.getByRole("button", { name: "GET /users/2" }).click()
  expect((await user).status()).toBe(200)
  await expect(byId).toContainText("Bob Smith")
  await expect(newestRequest(inspectorOf(byId))).toContainText("GET /users/2 → 200")

  const nested = sandbox(page, "caller.users.getUserPost")
  await nested.getByLabel("id", { exact: true }).selectOption("2")
  await nested.getByLabel("postId", { exact: true }).selectOption("3")
  const post = answerTo(page, "api.users.getUserPost")
  await nested.getByRole("button", { name: "GET /users/2/posts/3" }).click()
  expect((await post).status()).toBe(200)
  await expect(nested).toContainText("Request Groups Explained")

  await nested.getByLabel("id", { exact: true }).selectOption("1")
  const another = answerTo(page, "api.users.getUserPost")
  await nested.getByRole("button", { name: "GET /users/1/posts/3" }).click()
  expect((await another).status()).toBe(404)
  await expect(nested).toContainText("failed")
  await expect(newestRequest(inspectorOf(nested))).toContainText("GET /users/1/posts/3 → 404")

  const paged = sandbox(page, "caller.users.getAll")
  await paged.getByLabel("page", { exact: true }).selectOption("2")
  const list = answerTo(page, "api.users.getAll")
  await paged.getByRole("button", { name: "GET /users?page=2&limit=2" }).click()
  expect((await list).status()).toBe(200)
  await expect(paged).toContainText("Carol Williams")
  await expect(paged).not.toContainText("Alice Johnson")
  await expect(newestRequest(inspectorOf(paged))).toContainText("GET /users?page=2&limit=2 → 200")
  await expect(inspectorOf(byId)).not.toContainText("/users?page=2")
  await expectNoSecrets(page, context, timings)
})

test("encodes a value with the address's own characters in the query", async ({
  page,
  context,
}) => {
  const timings = proxyTimings(page)
  await page.goto("/docs/examples/path-params")
  const search = sandbox(page, "caller.users.getAll({ search })")
  await search.getByLabel("search", { exact: true }).fill("Ann & co / 50%")
  const found = answerTo(page, "api.users.getAll")
  await search.getByRole("button", { name: "Search" }).click()
  expect((await found).status()).toBe(200)
  const sent = newestRequest(inspectorOf(search))
  await expect(sent).toContainText("GET /users?search=Ann+%26+co+%2F+50%25 → 200")
  await expect(inspectorOf(sandbox(page, "caller.users.getAll"))).toContainText("no request yet")
  await expectNoSecrets(page, context, timings)
})
