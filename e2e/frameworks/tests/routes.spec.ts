/**
 * The routes a page's proxy client may call, built by Courier's bundler
 * plugin from the application's `courier.config.ts`: in the HTML its server
 * renders, and in the code the browser runs once the page is up, where a
 * client built from them calls through the application's proxy. The config
 * opens `profile` to a page and keeps `audit` the server's, which the proxy
 * refuses as it does a name it does not know. Under the application's dev
 * server, an edit that opens `audit` reaches the page and the server that
 * renders it without a restart.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

import { APPS } from "../support/apps";
import { APP, APP_ROOT, clearReceived, received } from "../support/received";
import { targetOf } from "../support/targets";

const routesPage = APPS[targetOf(process.env.COURIER_FRAMEWORK).app].routesPage;
const path = routesPage?.path ?? "/";
const underDev = process.env.COURIER_FRAMEWORK_MODE === "dev";

/* A dev server compiles a page on its first request, and reloads it once Vite has
   optimized a dependency it found there: a check may wait for both. */
test.describe.configure({ timeout: underDev ? 180_000 : 60_000 });

/**
 * How long one attempt of a check waits for its answer. Nuxt's dev server
 * leaves a request unanswered when it arrives as Nitro reloads after an edit
 * to a module the server imports, and a navigation waits for ever unless told
 * otherwise: the attempt gives up, and the check is made anew.
 */
const ATTEMPT_MS = 30_000;

/**
 * Hold a check until it passes: at once for a built application, and under
 * its dev server for as long as the first loads take, each check made anew;
 * one that never passes fails with what it last found.
 */
async function settled(check: () => Promise<void>): Promise<void> {
  if (!underDev) return check();
  const deadline = Date.now() + 150_000;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/* The routes page as the browser shows it once it is up, opened anew for each attempt. */
async function showing(page: Page, id: string, text: string | RegExp): Promise<void> {
  await settled(async () => {
    await page.goto(`${APP}${path}`, { timeout: ATTEMPT_MS });
    await expect(page.locator(`#${id}`)).toContainText(text, { timeout: 15_000 });
  });
}

test("the server renders the page with the routes the config opens to it", async ({ request }) => {
  test.skip(routesPage?.rendered !== true, "the server of this application renders no page");

  await settled(async () => {
    const html = await (await request.get(`${APP}${path}`, { timeout: ATTEMPT_MS })).text();
    expect(html).toMatch(/id="server-routes"[^>]*>profile</);
  });
});

test("the code the browser runs holds the same routes", async ({ page }) => {
  await showing(page, "client-routes", /^profile$/);
});

test("a client built from the routes calls the endpoint they open through the proxy", async ({
  page,
}) => {
  test.skip(routesPage?.proxied !== true, "this application serves no proxy");

  await showing(page, "client-call", '"sid":null');
});

test("the proxy refuses the endpoint the routes keep closed, as it does a name it does not know", async ({
  request,
}) => {
  test.skip(routesPage?.proxied !== true, "this application serves no proxy");
  await clearReceived();
  const call = (method: string) => request.get(`${APP}/api/request?_s=catalog&_m=${method}`);

  const [opened, closed, unknown] = [
    await call("profile"),
    await call("audit"),
    await call("none"),
  ];

  expect(opened.status()).toBe(200);
  expect(closed.status()).toBe(unknown.status());
  expect(closed.ok()).toBe(false);
  expect(await received("GET", "/audit")).toEqual([]);
  expect(await received("GET", "/me")).toHaveLength(1);
});

test("an edit that opens an endpoint reaches the page without a restart, under the dev server", async ({
  page,
  request,
}) => {
  test.skip(!underDev, "the built application never changes");
  const catalog = join(APP_ROOT, routesPage?.catalogModule ?? "");
  const written = readFileSync(catalog, "utf8");
  writeFileSync(
    catalog,
    written.replace('endpoint.get("audit")', 'endpoint.get("audit").expose()'),
  );

  try {
    await showing(page, "client-routes", /audit/);
    if (routesPage?.rendered === true) {
      await settled(async () => {
        const html = await (await request.get(`${APP}${path}`, { timeout: ATTEMPT_MS })).text();
        expect(html).toMatch(/id="server-routes"[^>]*>[^<]*audit/);
      });
    }
  } finally {
    writeFileSync(catalog, written);
  }
});
