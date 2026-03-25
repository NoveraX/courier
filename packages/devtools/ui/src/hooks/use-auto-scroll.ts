import { useEffect } from "react";

const SCROLL_THRESHOLD = 36 * 3;

/** Auto-scroll to bottom when new items arrive (if already near bottom) */
export function useAutoScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  count: number,
  enabled: React.MutableRefObject<boolean>,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled.current) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [count, ref, enabled]);
}
