import { useEffect } from "react";

/* Typing goes to the field it is typed in. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const NEXT = new Set(["ArrowDown", "j"]);
const PREVIOUS = new Set(["ArrowUp", "k"]);

/**
 * Move through the Timeline's rows from the keyboard: ↓ or j opens the
 * next request in the inspector, ↑ or k the one before — the first when
 * none is open — unless a field takes the keys, or a menu took them first.
 *
 * @param ids - The rows' requests, top to bottom
 * @param openId - The request open
 * @param onMove - Opens a request, and brings its row into view
 * @example
 * ```ts
 * useRowKeys(flat.map((r) => r.id), requestId, (id) => { open(id); scrollTo(id); });
 * ```
 */
export function useRowKeys(
  ids: readonly string[],
  openId: string | undefined,
  onMove: (id: string) => void,
): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = NEXT.has(event.key) ? 1 : PREVIOUS.has(event.key) ? -1 : 0;
      if (step === 0 || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isTyping(event.target) || ids.length === 0) return;
      event.preventDefault();
      const at = openId === undefined ? -1 : ids.indexOf(openId);
      const next = at < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, at + step));
      const id = ids[next];
      if (id !== undefined) onMove(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids, openId, onMove]);
}
