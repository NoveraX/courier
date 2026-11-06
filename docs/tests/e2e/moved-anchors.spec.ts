/**
 * A link someone kept to a section that moved to another page: the page
 * the section left sends the reader on to where it is now, while an
 * anchor the page still has stays where it is.
 */
import { expect, test } from "./support/fixtures"

test("sends a reader who comes by a moved section's old anchor on to its new page", async ({
  page,
}) => {
  await page.goto("/docs/advanced/realtime#staying-connected")
  await expect(page).toHaveURL(/\/docs\/advanced\/realtime-connections#staying-connected$/)
  await expect(page.locator("#staying-connected")).toBeVisible()

  await page.goto("/docs/advanced/realtime#topics")
  await expect(page.locator("#topics")).toBeVisible()
  await expect(page).toHaveURL(/\/docs\/advanced\/realtime#topics$/)
})
