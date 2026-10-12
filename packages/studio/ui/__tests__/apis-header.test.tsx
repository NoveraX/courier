/**
 * @vitest-environment jsdom
 *
 * The APIs page's header: its title and count, and — beside Import API —
 * the check for newer specs and the OpenAPI export, which a phone reaches
 * from a "⋯" menu that does what the buttons do.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));

import { useOpenApiExport } from "@/apis/use-openapi-export";
import { post } from "@/lib/api-client";
import { ApisHeader } from "@/screens/apis/apis-header";
import { ExportOpenApiDialog } from "@/screens/apis/export-openapi-dialog";

interface PageProps {
  imports: boolean;
  onCheck: () => void;
  onImport: () => void;
}

function Page({ imports, onCheck, onImport }: PageProps): React.ReactNode {
  const exporter = useOpenApiExport();
  return (
    <>
      <ApisHeader
        summary="1 imported · 1 hand-written · 3 endpoints"
        check={{ can: imports, running: false, onCheck }}
        exporter={exporter}
        sources={["shop", "payments"]}
        importBlocked={null}
        onImport={onImport}
      />
      <ExportOpenApiDialog exporter={exporter} sources={["shop", "payments"]} />
    </>
  );
}

async function openMore(): Promise<void> {
  const trigger = screen.getByRole("button", { name: "More actions" });
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the APIs page's header", () => {
  it("says what the project declares, beside Import API", () => {
    const onImport = vi.fn();
    render(<Page imports onCheck={vi.fn()} onImport={onImport} />);

    expect(screen.getByRole("heading", { name: "APIs" })).toBeTruthy();
    expect(screen.getByText("1 imported · 1 hand-written · 3 endpoints")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import API" }));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("checks for newer specs from its menu, and not while there is no import", async () => {
    const onCheck = vi.fn();
    const { unmount } = render(<Page imports={false} onCheck={onCheck} onImport={vi.fn()} />);
    await openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Check for updates" }));
    expect(onCheck).not.toHaveBeenCalled();
    unmount();

    render(<Page imports onCheck={onCheck} onImport={vi.fn()} />);
    await openMore();
    fireEvent.click(screen.getByRole("menuitem", { name: "Check for updates" }));

    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("opens the export on the first source from its menu", async () => {
    vi.mocked(post).mockResolvedValue({
      text: "{}\n",
      fileName: "shop.openapi.json",
      operations: 0,
      leftOut: [],
    });
    render(<Page imports onCheck={vi.fn()} onImport={vi.fn()} />);

    await openMore();
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Export OpenAPI" }));
    });

    expect(screen.getByRole("dialog", { name: "Export OpenAPI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Source/ }).textContent).toContain("shop");
  });
});
