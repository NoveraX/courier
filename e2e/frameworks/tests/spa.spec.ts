/**
 * A single-page application whose browser calls an API on another origin
 * of its site itself: the browser sends its own cookies, and the page adds
 * only the double-submit token a write repeats. Served from another site,
 * the page is told the browser keeps the API's cookies from it.
 */
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { API, APP, clearReceived, received } from "../support/received";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
const json = async (selector: string): Promise<Record<string, unknown>> =>
  JSON.parse((await page.textContent(selector)) || "{}") as Record<string, unknown>;
/* The API's cookies are kept for its host, which the page shares on another port. */
const cookie = async (name: string) =>
  (await context.cookies(API)).find((each) => each.name === name);

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test("before anyone signs in, the page's read reaches the API from its own origin with no cookie", async () => {
  await clearReceived();

  await page.goto(`${APP}/`);
  await expect(page.locator("#me")).not.toBeEmpty();
  const [me] = await received("GET", "/me");

  expect(me?.headers.origin).toBe(APP);
  expect(me?.headers.cookie).toBeUndefined();
});

test("signing in from the page leaves the API's session cookie in the browser, out of the page's reach", async () => {
  await page.click("#sign-in");
  await expect(page.locator("#me")).toContainText("s%3Aspa.sig");

  expect(await cookie("sid")).toMatchObject({ value: "s%3Aspa.sig", httpOnly: true });
  expect(await page.evaluate(() => document.cookie)).not.toContain("sid=");
});

test("the sign-in, finding no double-submit token, asked the API for one first", async () => {
  const [asked] = await received("GET", "/csrf");
  const [signIn] = await received("POST", "/login");

  expect(asked?.headers.origin).toBe(APP);
  expect(signIn?.headers["x-csrftoken"]).toBe("t-fresh");
});

test("a read sends the browser's own cookies to the API on another origin, and no token", async () => {
  await clearReceived();

  await page.reload();
  await expect(page.locator("#me")).toContainText("s%3Aspa.sig");
  const [me] = await received("GET", "/me");

  expect(me?.headers.cookie).toContain("sid=s%3Aspa.sig");
  expect(me?.headers["x-csrftoken"]).toBeUndefined();
});

test("a write repeats the double-submit token the page reads from its cookies", async () => {
  await clearReceived();

  await page.click("#rename");
  await expect(page.locator("#renamed")).not.toBeEmpty();
  const [write] = await received("POST", "/me/name");

  expect(write?.headers["x-csrftoken"]).toBe("t-spa");
  expect((await json("#renamed")).sid).toBe("s%3Aspa.sig");
});

test("an API that keeps no session gets no cookies from the page", async () => {
  await clearReceived();

  await page.click("#public");
  await expect(page.locator("#public-me")).not.toBeEmpty();
  const [me] = await received("GET", "/me");

  expect(me?.headers.cookie).toBeUndefined();
  expect((await json("#public-me")).sid).toBeNull();
});

test("signing out from the page ends the session in the browser", async () => {
  await page.click("#sign-out");

  await expect.poll(async () => await cookie("sid")).toBeUndefined();
});

test("a page on another site than its API is told once, in the console, that the browser keeps its cookies from it", async ({
  browser,
}) => {
  const visitor = await browser.newContext();
  const tab = await visitor.newPage();
  const said: string[] = [];
  tab.on("console", (message) => {
    if (message.type() === "warning") said.push(message.text());
  });

  /* The same page from localhost: its API, on 127.0.0.1, is then another site. */
  await tab.goto(`${APP.replace("//127.0.0.1:", "//localhost:")}/`);

  const told = () => said.filter((line) => line.includes("on another site than this page"));
  await expect.poll(() => told().length).toBe(1);
  expect(told()[0]).toContain("Safari sends an API on another site none of its cookies");
  await visitor.close();
});
