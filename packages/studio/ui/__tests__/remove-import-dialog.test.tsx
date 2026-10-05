/**
 * @vitest-environment jsdom
 */
/**
 * Removing an import from the APIs page: the dialog previews which files
 * go, which wait for the user and which stay, and what courier.config still
 * holds of the import; nothing is removed until Remove, which quotes the
 * plan with the steps allowed. A plan that changed meanwhile comes back to
 * be looked at again.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import { post } from "@/lib/api-client";
import { StudioRequestError } from "@/lib/studio-request-error";
import { type UseRemoveImportReturn, useRemoveImport } from "../src/apis/use-remove-import";
import { RemoveImportDialog } from "../src/views/apis/remove-import-dialog";

const PLAN = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [],
  removals: [{ path: "src/api/pets/source.ts", was: "recorded" }],
  kept: [{ path: "src/api/pets/helpers.ts", reason: "not-written-by-studio" }],
  pending: [
    { path: "src/api/pets/pets/index.ts", kind: "remove", reason: "edited", preselected: false },
  ],
  blocked: [],
  forgotten: [],
};

const NOTES = {
  configFile: "courier.config.ts",
  importDeclared: true,
  configImports: ["src/api/pets/source.ts"],
};

let removal: UseRemoveImportReturn;

function Harness({
  onRemoved,
}: {
  onRemoved: (name: string, message: string) => void;
}): React.ReactElement {
  removal = useRemoveImport(onRemoved);
  return <RemoveImportDialog removal={removal} />;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the remove dialog", () => {
  it("previews the plan and what the config still holds, and removes nothing before Remove", async () => {
    vi.mocked(post).mockResolvedValueOnce({ plan: PLAN, ...NOTES });
    render(<Harness onRemoved={vi.fn()} />);

    await act(() => removal.start("pets"));

    expect(vi.mocked(post)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/apis/imports/remove/preview", {
      name: "pets",
    });
    expect(screen.getByText("src/api/pets/helpers.ts")).toBeTruthy();
    expect(screen.getByText(/it holds edits of yours/)).toBeTruthy();
    expect(screen.getByText(/courier\.config\.ts imports these files/)).toBeTruthy();
    expect(screen.getByText("imports.pets")).toBeTruthy();
  });

  it("removes as previewed, quoting the plan with the steps the user allowed", async () => {
    const onRemoved = vi.fn();
    vi.mocked(post)
      .mockResolvedValueOnce({ plan: PLAN, ...NOTES })
      .mockResolvedValueOnce({
        success: true,
        removed: ["src/api/pets/source.ts"],
        kept: [],
        backupDir: ".courier/backups/1-a",
        pruneFailures: [],
        ...NOTES,
      });
    render(<Harness onRemoved={onRemoved} />);
    await act(() => removal.start("pets"));

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(vi.mocked(post)).toHaveBeenLastCalledWith("/api/apis/imports/remove", {
      name: "pets",
      planDigest: "plan-1",
      confirm: ["src/api/pets/pets/index.ts"],
    });
    expect(onRemoved).toHaveBeenCalledWith(
      "pets",
      "Removed pets: moved 1 file into .courier/backups/1-a",
    );
    expect(removal.name).toBeNull();
  });

  it("drops an answer that arrives for an earlier opening of the dialog", async () => {
    const late = Promise.withResolvers<unknown>();
    vi.mocked(post)
      .mockImplementationOnce(() => late.promise)
      .mockResolvedValueOnce({ plan: { ...PLAN, digest: "plan-b" }, ...NOTES });
    render(<Harness onRemoved={vi.fn()} />);

    act(() => {
      void removal.start("a");
    });
    act(() => removal.close());
    await act(() => removal.start("b"));
    await act(async () => late.resolve({ plan: { ...PLAN, digest: "plan-a" }, ...NOTES }));

    expect(removal.name).toBe("b");
    expect(removal.consent?.plan.digest).toBe("plan-b");
  });

  it("says it left the files the user did not allow removing", async () => {
    const onRemoved = vi.fn();
    const kept = [{ path: "src/api/pets/pets/index.ts", reason: "unconfirmed" }];
    vi.mocked(post)
      .mockResolvedValueOnce({ plan: { ...PLAN, removals: [] }, ...NOTES })
      .mockResolvedValueOnce({
        success: true,
        removed: [],
        kept,
        backupDir: ".courier/backups/1-a",
        pruneFailures: [],
        ...NOTES,
      });
    render(<Harness onRemoved={onRemoved} />);
    await act(() => removal.start("pets"));

    await act(() => removal.confirm());

    expect(onRemoved).toHaveBeenCalledWith("pets", "Removed pets: left 1 file as it was");
  });

  it("shows the plan as it stands when the files changed since the preview, with nothing allowed", async () => {
    const changed = { ...PLAN, digest: "plan-2" };
    const stale = new StudioRequestError(
      "The files changed.",
      { error: "The files changed.", code: "PLAN_STALE", plan: changed },
      undefined,
    );
    vi.mocked(post)
      .mockResolvedValueOnce({ plan: PLAN, ...NOTES })
      .mockRejectedValueOnce(stale)
      .mockResolvedValueOnce({ plan: changed, ...NOTES, configImports: [] });
    render(<Harness onRemoved={vi.fn()} />);
    await act(() => removal.start("pets"));
    fireEvent.click(screen.getByRole("checkbox"));

    await act(() => removal.confirm());

    expect(removal.consent?.plan.digest).toBe("plan-2");
    expect(removal.consent?.confirmed).toEqual([]);
    expect(removal.notes?.configImports).toEqual([]);
    expect(screen.getByText("The files changed.")).toBeTruthy();
    expect(removal.name).toBe("pets");
  });
});
