/**
 * A Nuxt application calling an API that keeps the user's session: in the
 * pages its server renders, its server routes, and a proxy caller — in the
 * same process while a page renders, through the proxy route in the browser.
 */
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { clickThrough } from "../support/click-through";
import {
  APP,
  ATTACKER,
  clearReceived,
  cookiesIn,
  linkElsewhere,
  received,
} from "../support/received";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const json = async (selector: string): Promise<Record<string, unknown>> =>
  JSON.parse((await page.textContent(selector)) ?? "{}") as Record<string, unknown>;
const cookie = async (name: string) =>
  (await context.cookies(APP)).find((each) => each.name === name);
const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&amp;", "&"],
]);
const decodeEntities = (html: string): string =>
  html.replace(/&(?:quot|#39|lt|gt|amp);/g, (entity) => ENTITIES.get(entity) ?? entity);

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

test("signing in through a server route hands the browser the API's session cookie beside the application's own", async () => {
  await clickThrough(page, "#login");

  expect(await cookie("sid")).toMatchObject({ value: "s%3Aada.sig", path: "/", httpOnly: true });
  expect((await cookie("csrftoken"))?.value).toBe("t-ada");
  expect((await cookie("signed_in"))?.value).toBe("yes");
  expect(await cookie("vendor_tracking")).toBeUndefined();
});

test("the sign-in, finding no double-submit token, asked the API for one first", async () => {
  const [asked] = await received("GET", "/csrf");
  const [signIn] = await received("POST", "/login");

  expect(asked).toBeDefined();
  expect(signIn?.headers["x-csrftoken"]).toBe("t-fresh");
  expect(signIn?.headers.cookie).toBe("csrftoken=t-fresh");
});

test("a rendered page sends the session's cookies alone, with the request's id, browser and address", async () => {
  await clearReceived();

  await page.goto(`${APP}/`);
  const [me] = await received("GET", "/me");

  expect((await json("#me")).sid).toBe("s%3Aada.sig");
  expect(cookiesIn(me?.headers.cookie)).toEqual(["csrftoken=t-ada", "sid=s%3Aada.sig"]);
  expect(me?.headers["x-request-id"]).toMatch(/^[\da-f-]{36}$/);
  expect(me?.headers["user-agent"]).toBe(await page.evaluate(() => navigator.userAgent));
  expect(me?.headers["x-forwarded-for"]).toMatch(/127\.0\.0\.1|::1/);
  expect(me?.headers["x-csrftoken"]).toBeUndefined();
});

test("a proxy caller in a rendering page calls in process, with the user's session", async () => {
  await clearReceived();

  await page.goto(`${APP}/proxy`);
  const [me] = await received("GET", "/me");

  expect((await json("#proxy")).sid).toBe("s%3Aada.sig");
  expect(cookiesIn(me?.headers.cookie)).toEqual(["csrftoken=t-ada", "sid=s%3Aada.sig"]);
  expect(await received("GET", "/me")).toHaveLength(1);
});

test("a write from the application's own form repeats the double-submit token", async () => {
  await page.goto(`${APP}/`);
  await clearReceived();

  await clickThrough(page, "#rename");
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

test("a sign-in another site sets off for a visitor with no token is refused before one is asked for", async ({
  browser,
}) => {
  const visitor = await browser.newContext();
  const tab = await visitor.newPage();
  await clearReceived();

  await tab.goto(linkElsewhere("/attack-login"));
  await tab.click("#go");

  await expect(tab.locator("#outcome")).toHaveText("refused 403");
  expect(await received("GET", "/csrf")).toEqual([]);
  expect(await received("POST", "/login")).toEqual([]);
  await visitor.close();
});

test("a render's later call sends the session its first call renewed, and the browser keeps it", async () => {
  /* Planted as the browser holds the session's cookie: WebKit lets no plain cookie replace a Secure one. */
  const held = await cookie("sid");
  await context.addCookies([
    held ? { ...held, value: "expiring" } : { name: "sid", value: "expiring", url: APP },
  ]);
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
  await clickThrough(page, "#logout");

  expect(await cookie("sid")).toBeUndefined();
});

test("a browser's calls through the proxy route carry the session it set", async () => {
  await page.goto(`${APP}/proxy`);
  await clearReceived();

  await page.click("#proxy-run");
  await expect(page.locator("#proxy-browser")).toContainText("s%3Aproxy.sig");
  const [me] = await received("GET", "/me");

  expect((await cookie("sid"))?.value).toBe("s%3Aproxy.sig");
  expect(cookiesIn(me?.headers.cookie)).toEqual(["csrftoken=t-proxy", "sid=s%3Aproxy.sig"]);
  expect(await cookie("vendor_tracking")).toBeUndefined();
});

test("a server route's write for another site's request is refused", async () => {
  const response = await fetch(`${APP}/api/rename`, {
    method: "POST",
    headers: {
      cookie: "sid=s%3Aada.sig; csrftoken=t-ada",
      "sec-fetch-site": "cross-site",
      origin: ATTACKER,
    },
  });

  expect(await response.text()).toBe("refused 403");
});

test("each of many renders served at once carries its own user's session", async () => {
  const users = Array.from({ length: 20 }, (_, at) => `user${at}`);

  const rendered = await Promise.all(
    users.map(async (user) => {
      const html = await (await fetch(`${APP}/`, { headers: { cookie: `sid=${user}` } })).text();
      const me: unknown = JSON.parse(
        decodeEntities(/<pre id="me">([^<]*)<\/pre>/.exec(html)?.[1] ?? "{}"),
      );
      return typeof me === "object" && me !== null ? Reflect.get(me, "sid") : undefined;
    }),
  );

  expect(rendered).toEqual(users);
});
