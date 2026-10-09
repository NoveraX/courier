/**
 * @vitest-environment jsdom
 *
 * Where the project's code calls an endpoint, from the inspector and the
 * Explorer: each call site opens in the editor Settings names — through the
 * address that editor answers — none opens when Settings names none, a
 * public demo shows no such section, and a setting kept from before stays
 * only while it names an editor.
 */
import { HTTPError } from "@noverax/courier";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));

import { editorLink } from "@/features/editor/editor-link";
import { CalledFrom } from "@/inspector/tabs/called-from";
import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { DEFAULT_SETTINGS } from "@/store/constants";
import { storedSettings } from "@/store/stored-settings";

const SITE = {
  file: "src/checkout.ts",
  path: "/work/shop/src/checkout.ts",
  line: 12,
  column: 9,
  code: "await api.orders.place({ sku });",
};

afterEach(() => {
  vi.mocked(post).mockReset();
  useStudioStore.setState({ settings: DEFAULT_SETTINGS });
});

describe("a call site's address in an editor", () => {
  it("opens the file at its line and column in the editor named, or in none", () => {
    const at = (editor: Parameters<typeof editorLink>[0]) => editorLink(editor, SITE.path, 12, 9);

    expect(at("vscode")).toBe("vscode://file/work/shop/src/checkout.ts:12:9");
    expect(at("cursor")).toBe("cursor://file/work/shop/src/checkout.ts:12:9");
    expect(at("zed")).toBe("zed://file/work/shop/src/checkout.ts:12:9");
    expect(at("webstorm")).toBe(
      "webstorm://open?file=%2Fwork%2Fshop%2Fsrc%2Fcheckout.ts&line=12&column=9",
    );
    expect(at("off")).toBeUndefined();
    expect(editorLink("vscode", "C:\\work\\my shop\\cart.ts", 3, 1)).toBe(
      "vscode://file/C:/work/my%20shop/cart.ts:3:1",
    );
  });

  it("keeps a stored editor only while it names one", () => {
    expect(storedSettings({ codeEditor: "cursor" }, DEFAULT_SETTINGS).codeEditor).toBe("cursor");
    expect(storedSettings({ codeEditor: "notepad" }, DEFAULT_SETTINGS).codeEditor).toBe("vscode");
  });
});

describe("Called from", () => {
  it("lists each call site as a link that opens it in the editor Settings names", async () => {
    vi.mocked(post).mockResolvedValue({ sites: [SITE] });
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, codeEditor: "cursor" } });

    render(<CalledFrom source="shop" endpoint="orders.place" />);
    const link = await screen.findByRole("link", { name: /src\/checkout\.ts:12/ });

    expect(link.getAttribute("href")).toBe("cursor://file/work/shop/src/checkout.ts:12:9");
    expect(post).toHaveBeenCalledWith("/api/editor/sites", {
      source: "shop",
      endpoint: "orders.place",
    });
  });

  it("opens nothing when Settings names no editor, and says where to choose one", async () => {
    vi.mocked(post).mockResolvedValue({ sites: [SITE] });
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, codeEditor: "off" } });

    render(<CalledFrom source="shop" endpoint="orders.cancel" />);

    expect(await screen.findByText("src/checkout.ts:12")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Settings → Editor/)).toBeTruthy();
  });

  it("says so when no call in the project's code names the endpoint", async () => {
    vi.mocked(post).mockResolvedValue({ sites: [] });

    render(<CalledFrom source="shop" endpoint="orders.get" />);

    expect(
      await screen.findByText(/No call in the project's code names this endpoint/),
    ).toBeTruthy();
  });

  it("shows nothing on a public demo, which has no such route", async () => {
    vi.mocked(post).mockRejectedValue(
      new HTTPError({ status: 404, headers: new Headers(), data: {} }),
    );

    const { container } = render(<CalledFrom source="shop" endpoint="account.me" />);
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });
});
