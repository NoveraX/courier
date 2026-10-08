/**
 * An application whose server renders pages and takes form posts, calling an
 * API that keeps the user's session: SvelteKit with its loads, form actions
 * and endpoints, and Express, Fastify, Hono, Astro, React Router, Remix,
 * SolidStart and NestJS with the same routes.
 */
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { APPS } from "../support/apps";
import { clickThrough } from "../support/click-through";
import {
  APP,
  ATTACKER,
  clearReceived,
  cookiesIn,
  linkElsewhere,
  received,
} from "../support/received";
import { targetOf } from "../support/targets";

test.describe.configure({ mode: "serial" });

/* A server that hands the application a `Request` alone tells no client address. */
const knowsClientAddress = APPS[targetOf(process.env.COURIER_FRAMEWORK).app].peerAddress !== false;

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

test("signing in with a form post hands the browser the API's session cookie beside the application's own", async () => {
  await page.click("#login");
  await expect.poll(async () => (await cookie("sid"))?.value).toBe("s%3Aada.sig");

  expect(await cookie("sid")).toMatchObject({ path: "/", httpOnly: true });
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

test("a page sends the session's cookies alone, with the request's id, browser and address", async () => {
  await clearReceived();

  await page.goto(`${APP}/`);
  const [me] = await received("GET", "/me");

  expect((await json("#me")).sid).toBe("s%3Aada.sig");
  expect(cookiesIn(me?.headers.cookie)).toEqual(["csrftoken=t-ada", "sid=s%3Aada.sig"]);
  expect(me?.headers["x-request-id"]).toMatch(/^[\da-f-]{36}$/);
  expect(me?.headers["user-agent"]).toBe(await page.evaluate(() => navigator.userAgent));
  if (knowsClientAddress)
    expect(me?.headers["x-forwarded-for"]).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
  else expect(me?.headers["x-forwarded-for"]).toBeUndefined();
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

test("a page's later call sends the session its first call renewed, and the browser keeps it", async () => {
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

test("an endpoint's write for another site's request is refused", async () => {
  await clearReceived();

  const response = await fetch(`${APP}/rename-route`, {
    method: "POST",
    headers: {
      cookie: "sid=s%3Aada.sig; csrftoken=t-ada",
      "sec-fetch-site": "cross-site",
      origin: ATTACKER,
    },
  });

  /* The session refuses it in the route; a framework that checks a write's
     origin itself — Astro — refuses it with a 403 before the route runs. */
  const answer = await response.text();
  expect(answer === "refused 403" || response.status === 403).toBe(true);
  expect(await received("POST", "/me/name")).toEqual([]);
});
