/**
 * @vitest-environment jsdom
 */
/**
 * Saving settings as the Settings page does: an edit shows the unsaved
 * banner, and its Save persists the settings, applies the theme and hands
 * the new API defaults to the import wizard.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { Controller } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, useStudioStore } from "@/store";
import { SETTINGS_STORAGE_KEY } from "@/store/constants";
import { buildDefaultOptions } from "../src/features/apis/helpers";
import { ApisSection } from "../src/views/settings/apis-section";
import { UnsavedBanner } from "../src/views/settings/unsaved-banner";
import { useSettingsForm } from "../src/views/settings/use-settings-form";

function SettingsHarness(): React.ReactElement {
  const { form, isDirty, onSave, onDiscard } = useSettingsForm();
  return (
    <div>
      {isDirty && <UnsavedBanner onSave={form.handleSubmit(onSave)} onDiscard={onDiscard} />}
      <Controller
        control={form.control}
        name="theme"
        render={({ field }) => (
          <button type="button" onClick={() => field.onChange("light")}>
            Light theme
          </button>
        )}
      />
      <ApisSection form={form} />
    </div>
  );
}

function click(element: HTMLElement): Promise<void> {
  return act(async () => element.click());
}

beforeEach(() => {
  localStorage.clear();
  useStudioStore.getState().resetSettings();
});

afterEach(() => cleanup());

describe("the settings form", () => {
  it("shows the unsaved banner once a setting changes", async () => {
    render(<SettingsHarness />);
    expect(screen.queryByText("You have unsaved changes")).toBeNull();

    await click(screen.getByLabelText("Include comments"));

    expect(screen.getByText("You have unsaved changes")).toBeTruthy();
  });

  it("persists and applies the settings a save submits", async () => {
    render(<SettingsHarness />);

    await click(screen.getByText("Light theme"));
    await click(screen.getByLabelText("Include comments"));
    await click(screen.getByRole("button", { name: "Save" }));

    const state = useStudioStore.getState();
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null");
    expect(state.settings).toMatchObject({ theme: "light", apisIncludeComments: false });
    expect(stored).toMatchObject({ theme: "light", apisIncludeComments: false });
    expect(state.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(buildDefaultOptions("pets", state.settings).includeComments).toBe(false);
    expect(screen.queryByText("You have unsaved changes")).toBeNull();
  });

  it("drops the edits a discard throws away", async () => {
    render(<SettingsHarness />);

    await click(screen.getByLabelText("Include comments"));
    await click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.queryByText("You have unsaved changes")).toBeNull();
    expect(useStudioStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});
