/**
 * @vitest-environment jsdom
 *
 * Where the project's code calls an endpoint, from the inspector and the
 * Explorer: each call site opens in the editor Settings names — through the
 * address that editor answers — none opens when Settings names none, a page
 * without the project's token is told it needs the link Studio printed, a
 * public demo shows no such section, and a setting kept from before stays
 * only while it names an editor. Shown inside an editor's own tab, Studio
 * asks that editor to open the file.
 */
import { HTTPError } from "@noverax/courier";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));

const host = vi.hoisted(() => ({ inside: false }));
vi.mock("@/features/editor/editor-host", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  insideEditor: () => host.inside,
}));

import { editorLink } from "@/features/editor/editor-link";
import { CalledFrom } from "@/inspector/tabs/called-from";
import { post } from "@/lib/api-client";
import { StudioRequestError } from "@/lib/studio-request-error";
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

const INFO = { version: "1.0.0", startedAt: 1, project: { name: "shop", dependencies: [] } };

/* What Studio answers a page without the token, as the page's client throws it. */
function tokenRefusal(): StudioRequestError {
  const reason =
    "Studio makes changes, and reads past what it shows, only for a page opened from the link it printed in its terminal, which carries this project's token.";
  return new StudioRequestError(
    reason,
    { error: reason, code: "STUDIO_TOKEN_REQUIRED" },
    new HTTPError({ status: 401, headers: new Headers(), data: {} }),
  );
}

afterEach(() => {
  vi.mocked(post).mockReset();
  vi.restoreAllMocks();
  host.inside = false;
  useStudioStore.setState({ settings: DEFAULT_SETTINGS, studioInfo: null });
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

  it("tells a page without the project's token that it needs the link Studio printed", async () => {
    vi.mocked(post).mockRejectedValue(tokenRefusal());
    useStudioStore.setState({ studioInfo: INFO });

    render(<CalledFrom source="shop" endpoint="orders.refund" />);

    expect(
      await screen.findByText(
        /only on a page opened from the link it printed in its terminal, which carries the project's token/,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Called from")).toBeTruthy();
    expect(screen.queryByText(/reads past what it shows/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows nothing to a visitor of a public demo, which shows no project's code", async () => {
    vi.mocked(post).mockRejectedValue(tokenRefusal());
    useStudioStore.setState({ studioInfo: { ...INFO, demo: {} } });

    const { container } = render(<CalledFrom source="shop" endpoint="account.list" />);

    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });

  it("shows nothing where Studio has no such route, as for the host of a public demo", async () => {
    vi.mocked(post).mockRejectedValue(
      new HTTPError({ status: 404, headers: new Headers(), data: {} }),
    );

    const { container } = render(<CalledFrom source="shop" endpoint="account.me" />);
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });
});

describe("Called from, inside an editor's own tab", () => {
  it("asks that editor to open the call site, whatever editor Settings names", async () => {
    host.inside = true;
    vi.mocked(post).mockResolvedValue({ sites: [SITE] });
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, codeEditor: "off" } });
    const sent = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    render(<CalledFrom source="shop" endpoint="orders.place" />);
    (await screen.findByRole("link", { name: /src\/checkout\.ts:12/ })).click();

    expect(sent).toHaveBeenCalledWith(
      { source: "courier-studio", type: "open-file", path: SITE.path, line: 12, column: 9 },
      "*",
    );
    expect(screen.queryByText(/Choose an editor/)).toBeNull();
  });
});
