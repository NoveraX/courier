import { createServer } from "node:http";
import { expect, type Page, test } from "@playwright/test";

import type { Started } from "../support/process";
import { createProject, type Project } from "../support/project";
import { startRuntime } from "../support/runtime";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

/* Two thousand users: Studio's event carries the first of them, and the last one is in the part left out. */
const USERS = Array.from({ length: 2_000 }, (_, at) => ({
  id: `u${at}`,
  name: at === 1_999 ? "Grace Hopper" : `User ${at}`,
  email: `user${at}@example.com`,
  role: "member",
}));

let project: Project;
let upstream: { url: string; close(): Promise<void> };
let studio: Studio;
let runtime: Started;

async function startLargeUpstream(): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(USERS));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function sendUsersList(page: Page): Promise<void> {
  await page.goto(studio.link);
  /* The link opens the setup, which moves to the Timeline once it sees the
     app attached; a page opened before that move would be undone by it. */
  await expect(page).toHaveURL(/\/timeline/);
  await page.getByRole("link", { name: "Playground" }).click();
  /* By its name, not as the view's first button: until the Playground's code
     has loaded, the view still shows the Timeline. */
  await page.getByRole("button", { name: /^Endpoint: / }).click();
  await expect(page.getByPlaceholder(/^Search \d+ endpoints/)).toBeFocused();
  await page.keyboard.type("users.list");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^Send/ }).click();
  await expect(page.locator("main").getByText("User 0").first()).toBeVisible();
}

test.beforeAll(async () => {
  project = createProject("whole-search");
  upstream = await startLargeUpstream();
  studio = await startStudio(project.root, { COURIER_E2E_UPSTREAM: upstream.url });
  runtime = await startRuntime(project.root, studio.env);
});

test.afterAll(async () => {
  await runtime?.stop();
  await studio?.stop();
  await upstream?.close();
  project?.remove();
});

test("finds in a large answer what the part shown leaves out", async ({ page }) => {
  const warnings: string[] = [];
  const workers: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("worker", (worker) => workers.push(worker.url()));
  await sendUsersList(page);
  const main = page.locator("main");
  /* Until the runtime reports the call, the answer the run received shows whole, drawn as its
     pane scrolls: a row not drawn yet proves nothing. The report shows the part. */
  await expect(main.getByText(/: this is a part of it,/)).toBeVisible();
  await expect(main.getByText("Grace Hopper")).toHaveCount(0);

  await main.getByRole("searchbox", { name: "Find in the answer" }).fill("grace hopper");

  await expect(main.getByText(/^Searched the whole body, .+\.$/)).toBeVisible();
  await expect(main.locator("mark", { hasText: "Grace Hopper" })).toBeVisible();
  await expect(main.locator('[aria-current="true"]')).toHaveAttribute("data-path", "1999.name");
  await expect(main.getByText("1 / 1")).toBeVisible();
  /* The search ran in its worker: the page searches itself only when one cannot start. */
  expect(workers.some((url) => url.includes("whole-search-worker"))).toBe(true);
  expect(warnings.filter((text) => text.includes("search worker"))).toEqual([]);
});

test("finds it in the inspector's answer too, in the raw text by its line", async ({ page }) => {
  await page.goto(studio.link);
  await page
    .getByRole("link", { name: /Timeline/ })
    .first()
    .click();
  await page.locator("main").getByText("shop.users.list").first().click();
  await page.getByRole("tab", { name: "Response" }).click();
  const field = page.getByRole("searchbox", { name: "Find in the answer" });

  await field.fill("grace hopper");

  await expect(page.getByText(/^Searched the whole body, .+\.$/)).toBeVisible();
  await expect(page.locator("mark", { hasText: "Grace Hopper" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  const lines = JSON.stringify(USERS, null, 2).split("\n");
  const number = lines.findIndex((line) => line.includes('"Grace Hopper"')) + 1;
  await expect(page.locator(`[data-line="${number}"]`)).toContainText('"name": "Grace Hopper"');
});

test("draws the rows of a long answer its pane shows, and the others as it scrolls", async ({
  page,
}) => {
  await page.goto(studio.link);
  await page
    .getByRole("link", { name: /Timeline/ })
    .first()
    .click();
  await page.locator("main").getByText("shop.users.list").first().click();
  await page.getByRole("tab", { name: "Response" }).click();
  const field = page.getByRole("searchbox", { name: "Find in the answer" });
  const pane = page.getByRole("tabpanel").filter({ has: field });
  const bottom = () => pane.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  /* The part holds 215 users of six rows each and the note of those left out, 1,293 rows in
     all: a paneful is drawn. */
  const rows = pane.locator("[data-path]");
  await expect(pane.getByText('"User 0"')).toBeVisible();
  expect(await rows.count()).toBeLessThan(200);

  await bottom();

  await expect(pane.getByText(/^"… [\d,]+ more items"$/)).toBeVisible();
  await expect(pane.getByText('"User 0"')).toHaveCount(0);
  expect(await rows.count()).toBeLessThan(200);

  await pane.getByRole("button", { name: "Raw", exact: true }).click();
  await bottom();

  const lines = pane.locator("[data-line]");
  await expect(lines.last()).toHaveText(/^\d+\]$/);
  await expect(lines.last()).toBeVisible();
  expect(await lines.count()).toBeLessThan(200);

  /* The browser's find would see only the lines drawn: the answer's own search takes its keys,
     those of the platform the page reports, which a project's device may set apart from the host. */
  const apple = await page.evaluate(() => {
    const hints: unknown = Reflect.get(navigator, "userAgentData");
    const reported: unknown =
      typeof hints === "object" && hints !== null ? Reflect.get(hints, "platform") : undefined;
    const platform =
      typeof reported === "string" && reported !== "" ? reported : navigator.platform;
    return /mac|iphone|ipad|ipod/i.test(platform);
  });
  await lines.last().click();
  await page.keyboard.press(apple ? "Meta+f" : "Control+f");
  await expect(field).toBeFocused();
});
