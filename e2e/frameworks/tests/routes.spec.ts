/**
 * The routes a page's proxy client may call, built by Courier's bundler
 * plugin from the application's `courier.config.ts`: in the HTML its server
 * renders, and in the code the browser runs once the page is up. The config
 * opens `profile` to a page and keeps `audit` the server's.
 */
import { expect, test } from "@playwright/test";

import { APPS } from "../support/apps";
import { APP } from "../support/received";
import { targetOf } from "../support/targets";

const routesPage = APPS[targetOf(process.env.COURIER_FRAMEWORK).app].routesPage;
const path = routesPage?.path ?? "/";

test("the server renders the page with the routes the config opens to it", async ({ request }) => {
  test.skip(routesPage?.rendered !== true, "the server of this application renders no page");

  const html = await (await request.get(`${APP}${path}`)).text();

  expect(html).toMatch(/id="server-routes"[^>]*>profile</);
});

test("the code the browser runs holds the same routes", async ({ page }) => {
  await page.goto(`${APP}${path}`);

  await expect(page.locator("#client-routes")).toHaveText("profile");
});
