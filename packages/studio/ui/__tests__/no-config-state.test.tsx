/**
 * @vitest-environment jsdom
 */
/**
 * A project without courier.config is told which file to create and offered
 * the config it starts from while it has no API sources yet, shown in full
 * and copied as it is.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { TooltipProvider } from "../src/components/ui/tooltip";
import { NoConfigState } from "../src/views/apis/no-config-state";

const SNIPPET =
  'import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });\n';

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const fn of Object.values(toast)) fn.mockClear();
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
});

function renderPage(): HTMLElement {
  return render(
    <TooltipProvider>
      <NoConfigState />
    </TooltipProvider>,
  ).container;
}

describe("the APIs page of a project without courier.config", () => {
  it("names the file to create and shows the config a project with no sources starts from", async () => {
    const page = renderPage();

    expect(screen.getByRole("heading", { name: "No courier.config.ts" })).toBeDefined();
    expect(page.textContent).toContain("Create courier.config.ts at the project root.");
    await vi.waitFor(() => expect(page.querySelector(".shiki-block pre")?.textContent).toBe(SNIPPET), {
      timeout: 10_000,
    });
  }, 15_000);

  it("copies that config as it is", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Copy config" }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied config"));
    expect(writeText).toHaveBeenCalledWith(SNIPPET);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
