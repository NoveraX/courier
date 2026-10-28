import { useEffect } from "react";

import { isApplePlatform } from "@/lib/apple-platform";

interface FindShortcutOptions {
  /** The view the shortcut belongs to: its rows, its search field and its tools. */
  viewRef: React.RefObject<HTMLElement | null>;
  /** The view's own search field. */
  fieldRef: React.RefObject<HTMLInputElement | null>;
  /** Whether the shortcut is taken: while the view is long enough to draw only the rows in sight. */
  enabled: boolean;
}

/**
 * ⌘F on a Mac, Ctrl+F elsewhere, brings a long view's own search field to
 * hand while the person works in the view: the last click or focus was in
 * it. Such a view draws only the rows in sight, which are all the browser's
 * find can see, while the view's own search covers every row. Anywhere
 * else, and while the view is short, the browser's find is left alone.
 *
 * @param options - The view, its search field, and whether the shortcut is taken
 * @example
 * ```tsx
 * useFindShortcut({ viewRef: container, fieldRef: field, enabled: lines.length > EVERY_ROW_UP_TO });
 * ```
 */
export function useFindShortcut({ viewRef, fieldRef, enabled }: FindShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;
    let inView = isInside(viewRef.current, document.activeElement);
    const follow = (event: Event): void => {
      inView = isInside(viewRef.current, event.target);
    };
    const find = (event: KeyboardEvent): void => {
      const field = fieldRef.current;
      if (!inView || !field || event.defaultPrevented || !isFindKey(event)) return;
      event.preventDefault();
      field.focus();
      field.select();
    };
    document.addEventListener("pointerdown", follow, true);
    document.addEventListener("focusin", follow, true);
    document.addEventListener("keydown", find);
    return () => {
      document.removeEventListener("pointerdown", follow, true);
      document.removeEventListener("focusin", follow, true);
      document.removeEventListener("keydown", find);
    };
  }, [viewRef, fieldRef, enabled]);
}

function isInside(view: HTMLElement | null, target: EventTarget | null): boolean {
  return view !== null && target instanceof Node && view.contains(target);
}

/* The browser's own find keys. On a Mac, Ctrl+F moves the caret in a text
   field and is not find. On a layout whose letters are not Latin, the F key
   is known by its place on the keyboard, as the browser knows it. */
function isFindKey(event: KeyboardEvent): boolean {
  const apple = isApplePlatform();
  const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) return false;
  const key = event.key.toLowerCase();
  return key === "f" || (event.code === "KeyF" && !/^[a-z]$/.test(key));
}
