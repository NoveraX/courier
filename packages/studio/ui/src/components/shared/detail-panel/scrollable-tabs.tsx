import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function ScrollableTabs({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const checkScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScroll({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  return (
    <ScrollAreaPrimitive.Root className="relative border-b border-border-subtle">
      <ScrollAreaPrimitive.Viewport
        ref={ref}
        className="overflow-x-auto overflow-y-hidden"
        onScroll={checkScroll}
        onMouseEnter={checkScroll}
      >
        <div className="px-3">{children}</div>
      </ScrollAreaPrimitive.Viewport>

      <ScrollAreaPrimitive.ScrollAreaScrollbar
        orientation="horizontal"
        className="flex h-1.5 touch-none select-none flex-col border-t border-t-transparent p-px transition-colors"
      >
        <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
      </ScrollAreaPrimitive.ScrollAreaScrollbar>

      {/* Fade edges */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-background to-transparent transition-opacity duration-150",
          canScroll.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-background to-transparent transition-opacity duration-150",
          canScroll.right ? "opacity-100" : "opacity-0",
        )}
      />
    </ScrollAreaPrimitive.Root>
  );
}
