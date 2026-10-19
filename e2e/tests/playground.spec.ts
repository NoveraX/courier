import { expect, type Page, test } from "@playwright/test";

import type { Started } from "../support/process";
import { createProject, type Project } from "../support/project";
import { startRuntime } from "../support/runtime";
import { startUpstream, type TestServer } from "../support/servers";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let upstream: TestServer;
let studio: Studio;
let runtime: Started;

test.beforeAll(async () => {
  project = createProject("playground");
  upstream = await startUpstream();
  studio = await startStudio(project.root, { COURIER_E2E_UPSTREAM: upstream.url });
  runtime = await startRuntime(project.root, studio.env);
});

test.afterAll(async () => {
  await runtime?.stop();
  await studio?.stop();
  await upstream?.close();
  project?.remove();
});

test("sends a call through the app, and shows the upstream's answer", async ({ page }) => {
  await page.goto(studio.link);
  /* The link opens the setup, which moves to the Timeline once it sees the
     app attached; a page opened before that move would be undone by it. */
  await expect(page).toHaveURL(/\/timeline/);
  await page.getByRole("link", { name: "Playground" }).click();

  await endpointOf(page).click();
  /* Typed before the list's search takes the focus, the keys would reach the
     button that opened it, and Enter would close the list again. */
  await expect(page.getByPlaceholder(/^Search \d+ endpoints/)).toBeFocused();
  await page.keyboard.type("users.list");
  await page.keyboard.press("Enter");
  await expect(endpointOf(page)).toContainText("list");
  await page.getByRole("button", { name: /^Send/ }).click();

  const response = page.locator("main");
  await expect(response.getByText("Ada Lovelace").first()).toBeVisible();
  await expect(response.getByText("200").first()).toBeVisible();
});

/* The button naming the Playground's endpoint, which opens the list of them.
   Found by its name, not as the view's first button: the Playground's code
   loads when it is first opened, and until it has, the view still shows
   the Timeline, whose first button is its own. */
function endpointOf(page: Page) {
  return page.getByRole("button", { name: /^Endpoint: / });
}

/* The Playground on `users.get`, its variables' editor ready to type in. */
async function variablesOf(page: Page) {
  await page.goto(studio.link);
  /* The link opens the setup, which moves to the Timeline once it sees the
     app attached; a page opened before that move would be undone by it. */
  await expect(page).toHaveURL(/\/timeline/);
  await page.getByRole("link", { name: "Playground" }).click();
  await endpointOf(page).click();
  await expect(page.getByPlaceholder(/^Search \d+ endpoints/)).toBeFocused();
  await page.keyboard.type("users.get");
  await page.keyboard.press("Enter");
  /* Typed before the choice lands, the text would go to the endpoint shown before. */
  await expect(endpointOf(page)).toContainText(/users \/ get/);
  return page.getByRole("textbox", { name: "Variables" });
}

test("draws a quote in the variables the moment it is typed", async ({ page }) => {
  const editor = await variablesOf(page);
  /* The coloured text the editor draws under its transparent textarea. */
  const drawn = editor.locator("xpath=preceding-sibling::pre[1]");

  await editor.fill("{");
  await page.keyboard.type('"');

  await expect(editor).toHaveValue('{"');
  await expect(drawn).toHaveText('{"');
});

test("undoes the indent Tab adds, as it undoes typing", async ({ page }) => {
  const editor = await variablesOf(page);
  const sample = await editor.inputValue();
  await editor.fill('{\n"id": ""\n}');
  await editor.evaluate((area) => {
    if (area instanceof HTMLTextAreaElement) area.setSelectionRange(2, 2);
  });
  await page.keyboard.type("x");
  await page.keyboard.press("Tab");
  await expect(editor).toHaveValue('{\nx  "id": ""\n}');

  await page.keyboard.press("ControlOrMeta+z");

  /* Chrome undoes the indent alone; Safari undoes the run of typing the
     indent ended, as it undoes any typing. Either way the text is one it
     held before, where a wiped history left the indent in place. */
  await expect.poll(() => editor.inputValue()).not.toBe('{\nx  "id": ""\n}');
  expect([sample, '{\n"id": ""\n}', '{\nx"id": ""\n}']).toContain(await editor.inputValue());
});

test("keeps the lines ⌘/ comments out selected, their marks with them", async ({ page }) => {
  const editor = await variablesOf(page);
  await editor.fill('{\n  "a": 1,\n  "b": 2\n}');
  await editor.evaluate((area) => {
    if (area instanceof HTMLTextAreaElement) area.setSelectionRange(2, 20);
  });

  await page.keyboard.press("ControlOrMeta+/");

  await expect(editor).toHaveValue('{\n  // "a": 1,\n  // "b": 2\n}');
  const selected = () =>
    editor.evaluate((area) =>
      area instanceof HTMLTextAreaElement
        ? area.value.slice(area.selectionStart, area.selectionEnd)
        : null,
    );
  await expect.poll(selected).toBe('  // "a": 1,\n  // "b": 2');
});

test("records the call on the Timeline", async ({ page }) => {
  await page.goto(studio.link);

  await page
    .getByRole("link", { name: /Timeline/ })
    .first()
    .click();

  await expect(page.locator("main").getByText("shop.users.list").first()).toBeVisible();
});
