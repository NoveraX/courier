import type { Page } from "@playwright/test";

/**
 * Click what leaves the page and comes back to the same address — a form
 * posted to a server route that redirects home, a sign-out link — and wait
 * until the page it lands on has loaded. Waiting for the address would
 * return at once, as the page is there before the click, and leave the
 * navigation running into the next check.
 *
 * @param page - The page
 * @param selector - What to click
 * @example
 * ```ts
 * await clickThrough(page, "#logout");
 * expect(await cookie("sid")).toBeUndefined();
 * ```
 */
export async function clickThrough(page: Page, selector: string): Promise<void> {
  const landed = page.waitForEvent("load");
  await page.click(selector);
  await landed;
}
