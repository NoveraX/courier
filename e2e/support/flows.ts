import { expect, type Page } from "@playwright/test";

/**
 * Import the billing API from its URL with the wizard, write its files and
 * add it to courier.config.ts, as a developer does.
 *
 * @param page - Studio's page
 * @param specUrl - Where the specification is published
 * @example
 * ```ts
 * await importBilling(page, `${specs.url}/billing.json`);
 * ```
 */
export async function importBilling(page: Page, specUrl: string): Promise<void> {
  await page.getByRole("link", { name: "APIs" }).click();
  await page.getByRole("button", { name: "Import API" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Spec URL").fill(specUrl);
  await dialog.getByRole("button", { name: "Parse spec" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Generate preview" }).click();
  await dialog.getByRole("button", { name: /^Write \d+ files?$/ }).click();
  await dialog.getByRole("button", { name: "Add to courier.config.ts" }).click();
  await expect(dialog.getByText(/is in Studio/)).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
}
