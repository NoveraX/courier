/**
 * @vitest-environment jsdom
 *
 * Inside an editor's own tab, Studio shows the page the editor asks for —
 * a page of its own, never another site — heard only from the window that
 * framed it, and tells the editor each page that shows. In a browser tab it
 * does neither.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ inside: true }));
vi.mock("@/features/editor/editor-host", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  insideEditor: () => host.inside,
}));

import { type BridgedRouter, bridgeToEditorHost } from "@/features/editor/editor-bridge";

function routerSpy() {
  const navigate = vi.fn(async () => undefined);
  let resolved: ((change: { toLocation: { href: string } }) => void) | undefined;
  const router: BridgedRouter = {
    navigate,
    subscribe: (_event, listener) => {
      resolved = listener;
      return () => undefined;
    },
  };
  return { router, navigate, resolve: (href: string) => resolved?.({ toLocation: { href } }) };
}

const ask = (data: unknown, source: MessageEventSource | null = window) =>
  dispatchEvent(new MessageEvent("message", { data, source }));

const bridges: (() => void)[] = [];
const bridged = (router: BridgedRouter) => bridges.push(bridgeToEditorHost(router));

afterEach(() => {
  for (const stop of bridges.splice(0)) stop();
  vi.restoreAllMocks();
  host.inside = true;
});

describe("Studio inside an editor's own tab", () => {
  it("shows the page the editor asks for, of Studio's own, from the window that framed it", () => {
    const { router, navigate } = routerSpy();
    bridged(router);

    ask({ source: "courier-vscode", type: "navigate", path: "/timeline?req=r7" });
    ask({ source: "courier-vscode", type: "navigate", path: "//collector.example/x" });
    ask({ source: "courier-vscode", type: "navigate", path: "/audit" }, null);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ href: "/timeline?req=r7" });
  });

  it("tells the editor each page that shows", () => {
    const sent = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const { router, resolve } = routerSpy();
    bridged(router);

    resolve("/explorer/endpoints?endpoint=shop.orders.place");

    expect(sent).toHaveBeenCalledWith(
      {
        source: "courier-studio",
        type: "location",
        path: "/explorer/endpoints?endpoint=shop.orders.place",
      },
      "*",
    );
  });

  it("does neither in a browser tab", () => {
    host.inside = false;
    const { router, navigate, resolve } = routerSpy();
    const sent = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    bridged(router);

    ask({ source: "courier-vscode", type: "navigate", path: "/audit" });
    resolve("/audit");

    expect(navigate).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });
});
