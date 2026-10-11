import { cpSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { dragEdge } from "./editor-scenes.mjs";

/** The local model the chat needs before it hands @courier a request. */
export const LOCAL_MODEL = new URL("./local-model", import.meta.url).pathname;

/**
 * A copy of the vscode-icons installed in your own VS Code — `VSICONS_PATH`
 * names another — in the shots' profile, so that applying Courier's icons
 * rewrites the copy's theme, not yours.
 *
 * @param {string} root - The profile's folder
 * @returns {string | undefined} The copy, or `undefined` when vscode-icons is not installed
 */
export function vsiconsCopy(root) {
  const installed = join(homedir(), ".vscode", "extensions");
  const found =
    env.VSICONS_PATH ??
    (existsSync(installed)
      ? readdirSync(installed)
          .filter((name) => name.startsWith("vscode-icons-team.vscode-icons-"))
          .sort()
          .map((name) => join(installed, name))
          .at(-1)
      : undefined);
  if (!found) return undefined;
  const copy = join(root, "vscode-icons");
  cpSync(found, copy, { recursive: true });
  return copy;
}

/**
 * Take the offer of Courier's icons, which comes once the editor opens a
 * Courier project with vscode-icons in use, and wait for the icons to go in.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 */
export async function takeIconOffer(page) {
  const show = page
    .locator(".notification-toast .monaco-button", { hasText: "Show Icons" })
    .first();
  await show.waitFor({ timeout: 60_000 });
  await show.click();
  await page
    .locator(".notification-toast", { hasText: "Courier's icons are in" })
    .first()
    .waitFor({ timeout: 30_000 });
}

/**
 * The Explorer's rows, as the part of the window a shot of the icons takes.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 * @returns {Promise<{ x: number, y: number, width: number, height: number }>} The part
 */
export async function explorerPart(page) {
  await page
    .locator(".explorer-folders-view .monaco-list-row", { hasText: "tsconfig.json" })
    .waitFor();
  await page.waitForTimeout(1500);
  const side = await page.locator(".part.sidebar").boundingBox();
  const last = await page.locator(".explorer-folders-view .monaco-list-row").last().boundingBox();
  if (!side || !last) throw new Error("The Explorer is not showing");
  return { x: side.x, y: side.y, width: side.width, height: last.y + last.height + 12 - side.y };
}

/**
 * Ask @courier about the checkout's endpoint, and wait for its answer.
 *
 * @param {import("@playwright/test").Page} page - VS Code's window
 * @returns {Promise<{ x: number, y: number, width: number, height: number }>} The chat's part of the window, above its input
 */
export async function askCourier(page) {
  await page.keyboard.press("Control+Alt+3");
  await page
    .locator(".interactive-item-container", { hasText: "Open in Studio" })
    .first()
    .waitFor({ timeout: 60_000 });
  const panel = await page.locator(".part.auxiliarybar").boundingBox();
  if (panel) await dragEdge(page, panel.x, panel.y + panel.height / 2, -260);
  await page.mouse.move(8, 8);
  await page.waitForTimeout(2500);
  const chat = await page.locator(".part.auxiliarybar").boundingBox();
  const input = await page
    .locator(".part.auxiliarybar .interactive-input-part")
    .first()
    .boundingBox();
  if (!chat || !input) throw new Error("The chat is not showing");
  return { x: chat.x, y: chat.y, width: chat.width, height: input.y - chat.y };
}
