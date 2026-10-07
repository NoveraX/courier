/**
 * An application whose server renders pages and takes form posts, calling an
 * API that keeps the user's session: SvelteKit with its loads, form actions
 * and endpoints, and Express with the same routes.
 */
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { APP, ATTACKER, clearReceived, linkElsewhere, received } from "../support/received";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const json = async (selector: string): Promise<Record<string, unknown>> =>
  JSON.parse((await page.textContent(selector)) ?? "{}") as Record<string, unknown>;
const cookie = async (name: string) =>
  (await context.cookies(APP)).find((each) => each.name === name);

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  await context.addCookies([{ name: "theme", value: "dark", url: APP }]);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test("a page renders without a session, sending no cookie", async () => {
  await clearReceived();

  await page.goto(`${APP}/`);

  expect((await json("#me")).cookie).toBeNull();
});

test("signing in with a form post hands the browser the API's session cookie", async () => {
  await page.click("#login");
  await expect.poll(async () => (await cookie("sid"))?.value).toBe("s%3Aada.sig");

  expect(await cookie("sid")).toMatchObject({ path: "/", httpOnly: true });
  expect((await cookie("csrftoken"))?.value).toBe("t-ada");
  expect(await cookie("vendor_tracking")).toBeUndefined();
});

test("a page sends the session's cookies alone, with the request's id, browser and address", async () => {
  await clearReceived();

  await page.goto(`${APP}/`);
  const [me] = await received("GET", "/me");

  expect((await json("#me")).sid).toBe("s%3Aada.sig");
  expect(me?.headers.cookie).toBe("sid=s%3Aada.sig; csrftoken=t-ada");
  expect(me?.headers["x-request-id"]).toMatch(/^[\da-f-]{36}$/);
  expect(me?.headers["user-agent"]).toContain("Chrome");
  expect(me?.headers["x-forwarded-for"]).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
  expect(me?.headers["x-csrftoken"]).toBeUndefined();
});

test("a write from the application's own form repeats the double-submit token", async () => {
  await clearReceived();

  await page.click("#rename");
  await expect.poll(async () => (await received("POST", "/me/name")).length).toBe(1);
  const [write] = await received("POST", "/me/name");

  expect(write?.headers["x-csrftoken"]).toBe("t-ada");
  expect(write?.headers.referer).toBe(`${APP}/`);
});

test("a write set off by another site's link is refused before it reaches the API", async () => {
  await clearReceived();

  await page.goto(linkElsewhere("/attack"));
  await page.click("#go");

  await expect(page.locator("#outcome")).toHaveText("refused 403");
  expect(await received("POST", "/me/name")).toEqual([]);
});

test("a page's later call sends the session its first call renewed, and the browser keeps it", async () => {
  await context.addCookies([{ name: "sid", value: "expiring", url: APP }]);
  await clearReceived();

  await page.goto(`${APP}/renew`);
  const renew = (await json("#renew")) as { second?: { sid?: string } };
  const ids = (await received("GET", "/me")).map((call) => call.headers["x-request-id"]);

  expect(renew.second?.sid).toBe("renewed");
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(1);
  expect((await cookie("sid"))?.value).toBe("renewed");
});

test("signing out through a link clears the session cookie", async () => {
  await page.goto(`${APP}/`);
  await page.click("#logout");
  await page.waitForURL(`${APP}/`);

  expect(await cookie("sid")).toBeUndefined();
});

test("an endpoint's write for another site's request is refused", async () => {
  const response = await fetch(`${APP}/rename-route`, {
    method: "POST",
    headers: {
      cookie: "sid=s%3Aada.sig; csrftoken=t-ada",
      "sec-fetch-site": "cross-site",
      origin: ATTACKER,
    },
  });

  expect(await response.text()).toBe("refused 403");
});
