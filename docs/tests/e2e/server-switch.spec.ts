/**
 * The examples whose call runs on the server too: switched to the server,
 * each shows its code there and runs the call in a Server Action — the
 * action's POST as the browser recorded it, the call's way to the API as
 * the site's server traced it — so the two ways can be set side by side:
 * the same chain, the same HTTPError, the same bytes, and a timeout that
 * bounds the server's request rather than the browser's wait.
 */
import type { Locator, Page } from "@playwright/test"

import { expect, sandbox, test } from "./support/fixtures"
import { expectNoSecrets, inspectorOf, newestRequest } from "./support/inspector"

/* An example's section, by its heading's anchor, switched to its server way. */
async function onTheServer(page: Page, path: string, anchor: string): Promise<Locator> {
  await page.goto(path)
  const section = page.locator(`section:has(> h2#${anchor})`)
  await section.getByLabel("on the server, in a Server Action").check()
  return section
}

/* What a server sandbox shows of its run: the call on the server, and the browser's POST. */
function runShown(server: Locator, path: string) {
  return {
    call: server.getByRole("region", { name: "The call on the server" }),
    post: () =>
      expect(newestRequest(inspectorOf(server))).toContainText(
        `browser → Server Action (POST ${path})`
      ),
  }
}

test("runs the error call in a Server Action: the same HTTPError, on the server", async ({
  page,
  context,
}) => {
  const section = await onTheServer(page, "/docs/examples/errors", "httperror-catch-inspect")
  await expect(section).toContainText('createAction(sources, "api")')
  const server = sandbox(page, "action.misc.error({ code }) — on the server")
  await server.getByRole("button", { name: "Trigger it on the server" }).click()
  const shown = runShown(server, "/docs/examples/errors")
  await expect(shown.call).toContainText("in a Server Action → API (demo): GET /error/404 → 404")
  await shown.post()
  await expect(server).toContainText("Intentional 404 error")
  await expectNoSecrets(page, context)
})

test("runs the middleware call in a Server Action, through the same chain", async ({ page }) => {
  await onTheServer(page, "/docs/examples/middleware", "response-transformation")
  const server = sandbox(page, "action.users.getAll() — on the server")
  await server.getByRole("button", { name: "Fetch users on the server" }).click()
  const shown = runShown(server, "/docs/examples/middleware")
  await expect(shown.call).toContainText("GET /users → 200")
  await expect(shown.call.getByRole("listitem")).toHaveText([
    /^log · wrap/,
    /^auth · wrap .*added authorization$/,
    /^stamp · after/,
    /^failures · wrap/,
  ])
  await shown.post()
  await expect(server).toContainText('"_meta"')
})

test("runs out of time on the server, the server's request to the API given up", async ({
  page,
}) => {
  await onTheServer(page, "/docs/examples/options", "timeout")
  const server = sandbox(page, "action.misc.with({ timeout }).slow() — on the server")
  await server.getByRole("button", { name: "Fetch /slow on the server" }).click()
  const shown = runShown(server, "/docs/examples/options")
  await expect(shown.call).toContainText("GET /slow → timed out after 1.0 s")
  await expect(server).toContainText("TimeoutError")
  await shown.post()
})

test("sends the same bytes from a Server Action as through the proxy", async ({ page }) => {
  await onTheServer(page, "/docs/examples/encoding", "body-encoding")
  const server = sandbox(page, "action.echo.send — on the server")
  await server.getByRole("button", { name: "URL-encoded, on the server" }).click()
  await expect(server).toContainText('"rawBody": "apiVersion=v2&name=John&role=admin"')
  await expect(runShown(server, "/docs/examples/encoding").call).toContainText(
    "POST /echo?format=json → 200"
  )
})
