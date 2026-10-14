import { expect, type Page, test } from "@playwright/test";

import { createProject, type Project } from "../support/project";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let studio: Studio;

test.beforeAll(async () => {
  project = createProject("command-palette");
  studio = await startStudio(project.root);
});

test.afterAll(async () => {
  await studio?.stop();
  project?.remove();
});

/* The shell listens for its shortcuts once it is up; a key pressed before is lost. */
async function openStudio(page: Page): Promise<void> {
  await page.goto(studio.link);
  await expect(page.getByRole("button", { name: /^Search or jump to/ })).toBeVisible();
}

test("shows each shortcut's keys as the keyboard labels them", async ({ page }) => {
  await openStudio(page);
  /* The platform as the page reads it: the client hints first, which Playwright's devices set
     from their user agent — Desktop Chrome's is Windows' — then the older field. */
  const apple = await page.evaluate(() => {
    const hints: unknown = Reflect.get(navigator, "userAgentData");
    const reported: unknown =
      typeof hints === "object" && hints !== null ? Reflect.get(hints, "platform") : undefined;
    const platform =
      typeof reported === "string" && reported !== "" ? reported : navigator.platform;
    return /mac|iphone|ipad|ipod/i.test(platform);
  });
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search Studio" });

  const pause = dialog.getByRole("option", { name: /^Pause recording/ });
  const theme = dialog.getByRole("option", { name: /^Toggle theme/ });

  await expect(pause.locator('kbd kbd[aria-hidden="true"]')).toHaveText(
    apple ? ["⌘", "."] : ["Ctrl", "."],
  );
  await expect(theme.locator('kbd kbd[aria-hidden="true"]')).toHaveText(
    apple ? ["⇧", "⌘", "L"] : ["Ctrl", "Shift", "L"],
  );
});

test("has nothing past its edges to scroll, its search field always in place", async ({ page }) => {
  await openStudio(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search Studio" });
  const field = dialog.getByRole("combobox");
  await expect(field).toBeFocused();

  for (let step = 0; step < 30; step += 1) await page.keyboard.press("ArrowDown");

  /* Only the list scrolls. Anything placed outside it — a shortcut's names for a screen reader —
     would lengthen the dialog past its edges, and a find in the page or a screen reader moving
     to it would scroll the dialog, carrying the field out of sight. */
  const sizes = await dialog.evaluate((element) => [element.scrollHeight, element.clientHeight]);
  expect(sizes[0]).toBe(sizes[1]);
  await expect(field).toBeInViewport({ ratio: 1 });
  await expect(dialog.locator('[cmdk-item][data-selected="true"]')).toBeInViewport();
});
