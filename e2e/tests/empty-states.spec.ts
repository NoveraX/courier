import { expect, type Page, test } from "@playwright/test";

import { createProject, type Project } from "../support/project";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let studio: Studio;

/* Studio over the project, with no app attached and nothing sent yet. */
test.beforeAll(async () => {
  project = createProject("empty-states");
  studio = await startStudio(project.root);
});

test.afterAll(async () => {
  await studio?.stop();
  project?.remove();
});

/** Where a page's notice sits: its words against the box that holds them, the box against the view. */
interface Placement {
  /** How far the words' middle is from the box's middle, in pixels. */
  offCentre: number;
  /** How far the box stops above the bottom of the view. */
  aboveBottom: number;
}

/* The box is the nearest flex box around the title that centres what it holds. */
function placementOf(page: Page, title: string): Promise<Placement | null> {
  return page.evaluate((text) => {
    const words = [...document.querySelectorAll("main p, main span, main h1")].find(
      (element) => element.textContent?.trim() === text,
    );
    let box = words?.parentElement ?? null;
    while (box && getComputedStyle(box).justifyContent !== "center") box = box.parentElement;
    const view = document.querySelector("main")?.getBoundingClientRect();
    if (!box || !view) return null;
    const outer = box.getBoundingClientRect();
    const parts = [...box.children].map((child) => child.getBoundingClientRect());
    const top = Math.min(...parts.map((part) => part.top));
    const bottom = Math.max(...parts.map((part) => part.bottom));
    return {
      offCentre: Math.abs((top + bottom) / 2 - (outer.top + outer.bottom) / 2),
      aboveBottom: view.bottom - outer.bottom,
    };
  }, title);
}

const NOTICES = [
  ["/playground", "No app attached"],
  ["/timeline", "Waiting for requests"],
  ["/waterfall", "Waiting for requests"],
  ["/analytics", "No completed requests yet"],
  ["/audit", "No requests to audit"],
  ["/middleware", "No call has run through middleware yet"],
  ["/compare", "Compare needs two finished requests"],
  ["/mocks", "No mock servers yet"],
  ["/mocks/routes", "No mock servers yet"],
  ["/mocks/logs", "No mock servers yet"],
] as const;

test("puts each page's notice in the middle of the space the page leaves it", async ({ page }) => {
  for (const [path, title] of NOTICES) {
    /* Each in a tab of its own: in WebKit a load started while the tab's
       last page still rewrote its address was cut short. Reading needs no
       token. */
    const tab = await page.context().newPage();
    await tab.goto(new URL(path, studio.link).href);
    await expect(tab.locator("main").getByText(title, { exact: true })).toBeVisible();

    const placement = await placementOf(tab, title);

    expect(placement, `${path}: a box that centres "${title}"`).not.toBeNull();
    expect(placement?.offCentre, `${path}: off the middle`).toBeLessThanOrEqual(1);
    /* Down to the view's bottom, short of the page's own bottom padding or the chart's legend. */
    expect(placement?.aboveBottom, `${path}: above the bottom`).toBeLessThanOrEqual(48);
    await tab.close();
  }
});
