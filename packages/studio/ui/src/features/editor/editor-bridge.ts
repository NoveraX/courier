import { isRecord } from "@/store/event-helpers";

import { askEditorHost, insideEditor } from "./editor-host";

/** The part of Studio's router the bridge drives and follows. */
export interface BridgedRouter {
  navigate(options: { href: string }): Promise<unknown>;
  subscribe(
    event: "onResolved",
    listener: (change: { toLocation: { href: string } }) => void,
  ): () => void;
}

/**
 * Inside an editor's own tab, show the page the editor asks for — an
 * endpoint, a request, the audit — without loading Studio again, and tell
 * the editor each page that shows, so it opens the same one next time. A
 * page in a browser tab does neither. Only the window that framed Studio
 * is heard, and only for a page of Studio's own.
 *
 * @param router - Studio's router
 * @returns What stops the bridge
 * @example
 * ```ts
 * bridgeToEditorHost(router);
 * ```
 */
export function bridgeToEditorHost(router: BridgedRouter): () => void {
  if (!insideEditor()) return () => undefined;
  const asked = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const path = pageAsked(event.data);
    if (path !== undefined) void router.navigate({ href: path });
  };
  addEventListener("message", asked);
  const unsubscribe = router.subscribe("onResolved", ({ toLocation }) => {
    askEditorHost({ source: "courier-studio", type: "location", path: toLocation.href });
  });
  return () => {
    removeEventListener("message", asked);
    unsubscribe();
  };
}

/* A page of Studio's own, by its path: `/timeline?req=…`, never another site's `//host/…`. */
function pageAsked(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  const { source, type, path } = data;
  if (source !== "courier-vscode" || type !== "navigate" || typeof path !== "string")
    return undefined;
  return path.startsWith("/") && !path.startsWith("//") ? path : undefined;
}
