/**
 * A Next.js application whose server calls an API that keeps the user's
 * session: in its pages, Server Actions, Route Handlers and the Pages
 * Router, through its proxy route from a client component, and in a page
 * that writes while it renders, whose token its middleware hands over.
 */
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { browsers } from "../../support/browsers";
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

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  await context.addCookies([{ name: "theme", value: "dark", url: APP }]);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

/* A click before React hydrates the page may go unheard; the page marks when it has. */
const hydrated = () => page.locator("html[data-hydrated]").waitFor({ state: "attached" });

test("the build sends the API no session and no write", async () => {
  /* What the build sent is the same whatever the browser; the first engine reads it, before any page. */
  test.skip(test.info().project.name !== browsers()[0], "read once, by the first browser");
  const sent = [
    ...(await received("GET", "/me")),
    ...(await received("GET", "/csrf")),
    ...(await received("POST", "/login")),
  ];

  expect(sent).toEqual([]);
});

test("a page renders without a session, sending no cookie", async () => {
  await clearReceived();

  await page.goto(`${APP}/`);

  expect((await json("#me")).cookie).toBeNull();
});

test("signing in with a Server Action hands the browser the API's session cookie beside the application's own", async () => {
  await hydrated();
  await page.click("#login");
  /* Next.js keeps the old render beside the new one while it swaps them. */
  await expect(page.locator("#me").filter({ hasText: "s%3Aada.sig" })).toBeVisible();

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

test("a page sends the session's cookies alone, with the request's id and browser", async () => {
  await clearReceived();

  await page.goto(`${APP}/`);
  const [me] = await received("GET", "/me");

  expect(cookiesIn(me?.headers.cookie)).toEqual(["csrftoken=t-ada", "sid=s%3Aada.sig"]);
  expect(me?.headers["x-request-id"]).toMatch(/^[\da-f-]{36}$/);
  expect(me?.headers["user-agent"]).toBe(await page.evaluate(() => navigator.userAgent));
  expect(me?.headers["x-csrftoken"]).toBeUndefined();
});

test("a write from the application's own form repeats the double-submit token", async () => {
  await clearReceived();

  await hydrated();
  await page.click("#rename");
  await expect.poll(async () => (await received("POST", "/me/name")).length).toBe(1);
  const [write] = await received("POST", "/me/name");

  expect(write?.headers["x-csrftoken"]).toBe("t-ada");
  expect(write?.headers.referer).toBe(`${new URL(APP).origin}/`);
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

test("a page with no route config that reads the session renders per request", async () => {
  await page.goto(`${APP}/plain`);

  expect((await json("#plain")).sid).toBe("s%3Aada.sig");
});

test("a Pages Router page served by withRequestContext carries the session", async () => {
  await page.goto(`${APP}/legacy`);

  expect((await json("#legacy")).sid).toBe("s%3Aada.sig");
});

test("a render's later call sends the session its first call renewed, under one request id", async () => {
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
  expect(new Set(ids).size).toBe(1);
  /* Next.js lets no page set cookies while it renders. */
  expect((await cookie("sid"))?.value).toBe("expiring");
});

test("a cookie value Next.js would change on the way still reaches the render's later calls", async () => {
  await page.goto(`${APP}/b64`);

  expect(((await json("#b64")) as { second?: { sid?: string } }).second?.sid).toBe("YWJj+ZGVm/==");
});

test("signing out through a link clears the session cookie", async () => {
  await page.goto(`${APP}/`);
  await clickThrough(page, "#logout");

  expect(await cookie("sid")).toBeUndefined();
});

test("a page that writes while it renders is handed the token with the page, asked once, and the browser keeps it", async ({
  browser,
}) => {
  const visitor = await browser.newContext();
  const tab = await visitor.newPage();
  await clearReceived();

  await tab.goto(`${APP}/visit`);
  await expect(tab.locator("#visit")).toHaveText("written");
  const asked = await received("GET", "/csrf");
  const [write] = await received("POST", "/login");

  expect(asked).toHaveLength(1);
  expect(write?.headers["x-csrftoken"]).toBe("t-fresh");
  expect((await visitor.cookies(APP)).find((each) => each.name === "csrftoken")?.value).toBe(
    "t-fresh",
  );

  /* The browser sends it with the next visit, and nothing is asked for again. */
  await clearReceived();
  await tab.goto(`${APP}/visit`);
  await expect(tab.locator("#visit")).toHaveText("written");
  expect(await received("GET", "/csrf")).toEqual([]);
  await visitor.close();
});

test("a client component's calls through the proxy route carry the session it set", async () => {
  await clearReceived();

  await page.goto(`${APP}/proxy`);
  await hydrated();
  await page.click("#proxy-run");
  await expect(page.locator("#proxy")).toContainText("s%3Aproxy.sig");
  const [me] = await received("GET", "/me");

  expect((await cookie("sid"))?.value).toBe("s%3Aproxy.sig");
  expect(cookiesIn(me?.headers.cookie)).toEqual(["csrftoken=t-proxy", "sid=s%3Aproxy.sig"]);
  expect(await cookie("vendor_tracking")).toBeUndefined();
});

test("a Route Handler's write for another site's request is refused", async () => {
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

test("a cached function calling an endpoint with no session is built ahead of time", async () => {
  test.skip(!process.env.COURIER_FRAMEWORK?.endsWith("cache-components"), "cacheComponents only");
  await clearReceived();

  await page.goto(`${APP}/cached`);

  await expect(page.locator("#cached")).toContainText("Notebook");
  expect(await received("GET", "/products")).toEqual([]);
});
