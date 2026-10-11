import { platform } from "node:process";
import { STUDIO } from "./vscode.mjs";

const MOD = platform === "darwin" ? "Meta" : "Control";

/**
 * Open the shopper's visit at its checkout, the side bar closed, and wait
 * for the figures over its calls — above them, or at the end of their lines.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 * @param {"codeLens" | "inlay"} [style] - Where the figures go
 */
export async function openVisit(page, style = "codeLens") {
  await page.keyboard.press(`${MOD}+P`);
  await page.keyboard.type("visit.ts", { delay: 30 });
  await page.waitForTimeout(900);
  await page.keyboard.press("Enter");
  const figures =
    style === "inlay"
      ? page.locator(".view-line", { hasText: " calls · " }).first()
      : page.locator(".codelens-decoration").first();
  await figures.waitFor({ timeout: 60_000 });
  await page.keyboard.press(`${MOD}+B`);
  await page.keyboard.press("Control+G");
  await page.keyboard.type("45", { delay: 30 });
  await page.keyboard.press("Enter");
  /* The figures come from Studio every few seconds; let them settle. */
  await page.waitForTimeout(6000);
}

/**
 * Hover over the checkout's call to `orders.place`.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 */
export async function hoverPlace(page) {
  const place = page
    .locator(".view-line", { hasText: "storefront.orders.place" })
    .locator("span span", { hasText: /^place$/ });
  await place.first().hover();
  await page.waitForSelector(".monaco-hover:not(.hidden)", { timeout: 15_000 });
  await page.waitForTimeout(1500);
}

/**
 * Open the Courier view with the checkout's endpoint open at its call and
 * chosen, so its actions show, the pointer resting below the view's rows.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 * @param {number} height - The window's height
 */
export async function openView(page, height) {
  await page.keyboard.press("Escape");
  await courierIcon(page).click();
  /* A group's row is named by its label and figures; an endpoint's speaks its full name first. */
  const row = (label) => page.locator(`.monaco-list-row[aria-label^="${label}"]`).first();
  await row("orders ").click();
  await row("shop.orders.place,").click();
  await page.waitForSelector('.monaco-list-row[aria-label^="src/traffic/visit.ts:"]');
  await page.mouse.move(200, height - 120);
  await page.waitForTimeout(1500);
}

/**
 * Open the endpoint's page of Studio in a tab of the editor's own, beside
 * the code that calls it.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 */
export async function openStudioTab(page) {
  await restPointer(page);
  await page.keyboard.press("Control+Alt+1");
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+Alt+2");
  /* The editor's webview frames the tab's page, which frames Studio. */
  await page
    .frameLocator("iframe.webview")
    .frameLocator("iframe#active-frame")
    .frameLocator("iframe#studio")
    .locator("#root, body")
    .first()
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(7000);
  /* Studio's toasts come and go with the demo's failing traffic; the shot of the tab leaves them out. */
  const studio = page.frames().find((frame) => frame.url().startsWith(STUDIO));
  await studio?.addStyleTag({ content: "[data-sonner-toaster] { display: none !important; }" });
  await restPointer(page);
}

/**
 * Open the Requests and the Mocks views, the endpoints' folded away, the
 * shop's mock open at its scenarios.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 */
export async function openLiveViews(page) {
  await page.keyboard.press("Escape");
  const endpoints = page.locator(".pane-header", { hasText: "Endpoints" }).first();
  /* A click on the icon of the views in front would close them. */
  if (!(await endpoints.isVisible())) await courierIcon(page).click();
  await endpoints.click();
  const side = await page.locator(".part.sidebar").boundingBox();
  if (side) await dragEdge(page, side.x + side.width, side.y + side.height / 2, 150);
  await page.locator('.monaco-list-row[aria-label^="Mock shop:"]').first().click();
  /* The views ask Studio every few seconds: wait until a failed request is among the latest. */
  await page
    .locator('.monaco-list-row[aria-label*=" failed: "]')
    .first()
    .waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.mouse.move(side ? side.x + 40 : 200, side ? side.y + side.height - 30 : 600);
}

/**
 * Drag the edge between two parts of the window, by its sash.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 * @param {number} x - The edge
 * @param {number} y - Where along it to take it
 * @param {number} by - How far to move it, rightwards
 */
export async function dragEdge(page, x, y, by) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

/**
 * Rest the pointer where nothing shows a tooltip: the empty end of the breadcrumbs.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 */
export async function restPointer(page) {
  const crumbs = await page.locator(".breadcrumbs-control").first().boundingBox();
  if (crumbs) await page.mouse.move(crumbs.x + crumbs.width - 24, crumbs.y + crumbs.height / 2);
}

/* The count of failing endpoints lies over the icon: the click goes to the item that holds both. */
function courierIcon(page) {
  return page.locator('.activitybar .action-item:has(a[aria-label^="Courier"])').first();
}
