/**
 * An Angular application built with Courier's builders: its page runs the
 * routes the builder built from the config, and the code the browser
 * loads holds the routes alone — nothing of the module the package ships,
 * and nothing of the API's definition.
 */
import { expect, test } from "@playwright/test";

import { API, APP } from "../support/received";

test("the page runs the routes the builder built, and its code holds nothing of the API's definition", async ({
  page,
  request,
}) => {
  await page.goto(`${APP}/`);
  await expect(page.locator("#client-routes")).toHaveText("profile");
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((all) => all.map((script) => script.getAttribute("src") ?? ""));

  const loaded: string[] = [];
  for (const src of scripts)
    loaded.push(await (await request.get(new URL(src, `${APP}/`).href)).text());
  const code = loaded.join("\n");

  /* An optimized build writes a key that is a name without its quotes. */
  expect(code).toMatch(/"?profile"?:\{"?type"?:"query"\}/);
  expect(code).not.toContain("ROUTES_NOT_BUILT");
  expect(code).not.toContain(API);
});
