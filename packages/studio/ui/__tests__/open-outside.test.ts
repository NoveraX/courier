/**
 * @vitest-environment jsdom
 *
 * A page outside Studio opens in a new tab — or, inside an editor's own
 * tab, the editor is asked to open it, since a frame opens no window.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ inside: false, ask: vi.fn() }));

vi.mock("@/features/editor/editor-host", () => ({
  insideEditor: () => host.inside,
  askEditorHost: host.ask,
}));

import { openOutside } from "@/shell/open-outside";

afterEach(() => {
  host.inside = false;
  host.ask.mockClear();
  vi.unstubAllGlobals();
});

describe("openOutside", () => {
  it("opens the page in a new tab that cannot reach back into Studio", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);

    openOutside("https://courier.noverax.cloud");

    expect(open).toHaveBeenCalledWith(
      "https://courier.noverax.cloud",
      "_blank",
      "noopener,noreferrer",
    );
    expect(host.ask).not.toHaveBeenCalled();
  });

  it("asks the editor to open it, inside an editor's own tab", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    host.inside = true;

    openOutside("https://courier.noverax.cloud");

    expect(host.ask).toHaveBeenCalledWith({
      source: "courier-studio",
      type: "open-external",
      url: "https://courier.noverax.cloud",
    });
    expect(open).not.toHaveBeenCalled();
  });
});
