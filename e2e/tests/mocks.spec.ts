import { expect, type Page, test } from "@playwright/test";

import { createProject, type Project } from "../support/project";
import { type Studio, startStudio } from "../support/studio";

test.describe.configure({ mode: "serial" });

let project: Project;
let studio: Studio;

test.beforeAll(async () => {
  project = createProject("mocks");
  studio = await startStudio(project.root);
});

test.afterAll(async () => {
  await studio?.stop();
  project?.remove();
});

/* What the mock answers, read as the app reads it: status 0 while nothing listens yet. */
async function users(): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${studio.mockPort}/users`).catch(() => null);
  if (res === null) return { status: 0, body: null };
  return { status: res.status, body: await res.json().catch(() => null) };
}

/* A file uploaded to the mock as a browser's form sends it: the status, and what the mock said. */
async function upload(name: string, type: string, bytes: number) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  const res = await fetch(`http://127.0.0.1:${studio.mockPort}/files`, {
    method: "POST",
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function openMocks(page: Page, tab?: string): Promise<void> {
  await page.goto(studio.link);
  await page.getByRole("link", { name: "Mocks" }).click();
  if (tab) await page.getByRole("link", { name: tab, exact: true }).first().click();
}

test("declares a mock with the wizard, which serves records its schema accepts", async ({
  page,
}) => {
  await openMocks(page);
  await page.getByRole("button", { name: "Generate mocks" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^shop/ }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Review change" }).click();
  /* The project has no mocks file yet, so Studio creates it. */
  await dialog.getByRole("button", { name: "Create courier.mocks.ts" }).click();
  await expect(dialog.getByRole("button", { name: /Done|Close|Open/ }).first()).toBeVisible();

  expect(project.read("courier.mocks.ts")).toContain("shop: defineMockServer(");
  await expect.poll(async () => (await users()).status).toBe(200);
  expect(Array.isArray((await users()).body)).toBe(true);
});

test("adds a record the schema accepts from the Store", async ({ page }) => {
  const before = (await users()).body as unknown[];
  await openMocks(page, "Store");

  await page.getByRole("button", { name: "Add record" }).click();

  await expect.poll(async () => ((await users()).body as unknown[]).length).toBe(before.length + 1);
  const added = ((await users()).body as Array<Record<string, unknown>>).at(-1);
  expect(added?.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
  expect(["admin", "member", "viewer"]).toContain(added?.role);
});

test("answers as a scenario says, and back as declared", async ({ page }) => {
  await openMocks(page, "Scenarios");
  const empty = page.locator("main").getByText("empty", { exact: true }).first();
  await empty
    .locator("xpath=ancestor::*[.//button][1]")
    .getByRole("button", { name: "Activate" })
    .click();

  await expect.poll(async () => (await users()).body).toEqual([]);
  await page.getByRole("button", { name: "Reset to happy path" }).click();
  await expect.poll(async () => ((await users()).body as unknown[]).length).toBeGreaterThan(0);
});

test("fails every request while the network is down, and recovers", async ({ page }) => {
  await openMocks(page, "Network");

  await page.locator("main").getByText("Down", { exact: true }).first().click();
  await expect.poll(async () => (await users()).status).toBe(503);
  await page.locator("main").getByText("Stable", { exact: true }).first().click();

  await expect.poll(async () => (await users()).status).toBe(200);
});

/* What the mock answers on another of its routes: one user the store holds. */
async function oneUser(id: string): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${studio.mockPort}/users/${id}`).catch(() => null);
  return res?.status ?? 0;
}

test("keeps a route set never to fail answering while the network is down, and keeps it switched off", async ({
  page,
}) => {
  const [first] = (await users()).body as Array<{ id: string | number }>;
  const user = () => oneUser(String(first?.id));
  await openMocks(page, "Network");
  const overrides = page.getByRole("region", { name: "Per-route overrides" });
  const route = (name: RegExp) => overrides.getByRole("button", { name });
  /* users.get: a delay of its own only, so it fails as the rest do. */
  await route(/users\.get/).click();
  await overrides.getByRole("slider", { name: "Route delay" }).press("ArrowRight");
  await route(/users\.get/).click();
  /* users.list: an error rate of its own of 0%. */
  await route(/users\.list/).click();
  await overrides.getByRole("slider", { name: "Route error rate" }).press("Home");
  await expect(route(/users\.list/)).toContainText("never fails");

  await page.locator("main").getByText("Down", { exact: true }).first().click();

  await expect.poll(user).toBe(503);
  expect((await users()).status).toBe(200);
  await expect(
    page.getByText(/With an error rate of their own: users\.list never fails/),
  ).toBeVisible();
  await expect(
    overrides.getByText("This route never fails, while the mock fails every other request."),
  ).toBeVisible();

  await overrides.getByRole("switch", { name: "Override users.list" }).click();
  await expect.poll(async () => (await users()).status).toBe(503);
  await page.reload();
  await expect(route(/users\.list/)).toContainText("never fails");
  await expect(overrides.getByRole("switch", { name: "Override users.list" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await overrides.getByRole("switch", { name: "Override users.list" }).click();
  await expect.poll(async () => (await users()).status).toBe(200);
  await page.locator("main").getByText("Stable", { exact: true }).first().click();
  await expect.poll(user).toBe(200);
});

test("takes uploads as the Uploads card says, and shows a slow one in the log as it arrives", async ({
  page,
}) => {
  await openMocks(page, "Network");
  const uploads = page.getByRole("region", { name: "Uploads" });
  await uploads
    .getByRole("group", { name: "Size limit" })
    .getByRole("button", { name: "1 MB" })
    .click();
  await uploads.getByRole("textbox", { name: "File types" }).fill("image/*");
  await uploads.getByRole("textbox", { name: "File types" }).press("Enter");
  await uploads
    .getByRole("group", { name: "Upload speed" })
    .getByRole("button", { name: "512 Kbps" })
    .click();

  await expect
    .poll(async () => (await upload("scan.png", "image/png", 2_097_152)).status)
    .toBe(413);
  expect(await upload("notes.txt", "text/plain", 1024)).toEqual({
    status: 415,
    body: { error: "notes.txt (text/plain) is not a type the mock takes: image/*" },
  });
  const slow = upload("photo.png", "image/png", 196_608);
  await page.getByRole("link", { name: "Logs", exact: true }).first().click();
  await expect(
    page
      .locator("main")
      .getByText(/^↑\d+%$/)
      .first(),
  ).toBeVisible();
  expect((await slow).status).toBe(200);

  await openMocks(page, "Network");
  await page
    .getByRole("region", { name: "Network condition" })
    .getByRole("button", { name: /Stop/ })
    .click();
  await expect
    .poll(async () => (await upload("scan.png", "image/png", 2_097_152)).status)
    .toBe(200);
});
