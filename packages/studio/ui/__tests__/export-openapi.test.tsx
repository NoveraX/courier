/**
 * @vitest-environment jsdom
 *
 * Exporting a source as OpenAPI from the APIs page: Export OpenAPI opens
 * the export on the first source the config declares, Studio writes the
 * document for the options shown — again once they change — and says what
 * it left out; the document downloads as its file or copies, and Studio's
 * refusal is shown with nothing to download.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
vi.mock("@/lib/export", () => ({ downloadFile: vi.fn() }));
vi.mock("@/lib/write-clipboard-text", () => ({ writeClipboardText: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

import { useOpenApiExport } from "@/apis/use-openapi-export";
import { post } from "@/lib/api-client";
import { downloadFile } from "@/lib/export";
import { writeClipboardText } from "@/lib/write-clipboard-text";
import { ExportOpenApiButton } from "@/screens/apis/export-openapi-button";
import { ExportOpenApiDialog } from "@/screens/apis/export-openapi-dialog";

const TEXT = '{\n  "openapi": "3.1.0",\n  "info": {\n    "title": "shop"\n  }\n}\n';
const WRITTEN = {
  text: TEXT,
  fileName: "shop.openapi.json",
  operations: 1,
  leftOut: [
    { operation: "search", reason: "QUERY has a place in OpenAPI 3.2.0" },
    { operation: "room", reason: "a channel has no form in OpenAPI" },
  ],
};

function ExportOnPage({ sources }: { sources: string[] }): React.ReactNode {
  const exporter = useOpenApiExport();
  return (
    <>
      <ExportOpenApiButton exporter={exporter} sources={sources} />
      <ExportOpenApiDialog exporter={exporter} sources={sources} />
    </>
  );
}

/* Past the pause typing is given, and Studio's answer. */
async function written(): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 300));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("exporting a source as OpenAPI", () => {
  it("writes the first source's document, says what it left out, and downloads it", async () => {
    vi.mocked(post).mockResolvedValue(WRITTEN);
    render(<ExportOnPage sources={["shop", "payments"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Export OpenAPI" }));
    await written();
    const dialog = within(screen.getByRole("dialog"));

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/openapi/document", {
      source: "shop",
      openapi: "3.1.0",
    });
    expect(dialog.getByText("1 operation · 2 left out")).toBeTruthy();
    expect(
      within(dialog.getByRole("list", { name: "Left out of the document" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "search — QUERY has a place in OpenAPI 3.2.0",
      "room — a channel has no form in OpenAPI",
    ]);
    expect(dialog.getByText('"openapi"')).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Download shop.openapi.json" }));
    expect(downloadFile).toHaveBeenCalledWith(TEXT, "shop.openapi.json");
  });

  it("writes it again for the version and title chosen, and copies it", async () => {
    vi.mocked(post).mockResolvedValue(WRITTEN);
    render(<ExportOnPage sources={["shop"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Export OpenAPI" }));
    await written();
    const dialog = within(screen.getByRole("dialog"));

    fireEvent.click(dialog.getByRole("button", { name: "3.2.0" }));
    fireEvent.change(dialog.getByLabelText("Title"), { target: { value: "Shop API" } });
    await written();
    fireEvent.click(dialog.getByRole("button", { name: "Copy" }));
    await written();

    expect(vi.mocked(post)).toHaveBeenLastCalledWith("/api/openapi/document", {
      source: "shop",
      openapi: "3.2.0",
      title: "Shop API",
    });
    expect(vi.mocked(post)).toHaveBeenCalledTimes(2);
    expect(writeClipboardText).toHaveBeenCalledWith(TEXT);
    expect(toast.success).toHaveBeenCalledWith("Copied shop.openapi.json");
  });

  it("shows why Studio wrote no document, offering nothing to download", async () => {
    vi.mocked(post).mockRejectedValue(new Error("Studio has not loaded courier.config yet."));
    render(<ExportOnPage sources={["shop"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Export OpenAPI" }));
    await written();
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByRole("alert").textContent).toBe("Studio has not loaded courier.config yet.");
    expect((dialog.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("is not offered while the config declares no source", () => {
    render(<ExportOnPage sources={[]} />);

    expect(
      (screen.getByRole("button", { name: "Export OpenAPI" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
