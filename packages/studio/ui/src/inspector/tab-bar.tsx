import { motion } from "motion/react";

import { INDICATOR_SPRING } from "@/design/motion";
import type { InspectorTab, InspectorTabInfo } from "@/features/requests/inspector-tabs";
import { cn } from "@/lib/utils";

interface TabBarProps {
  tabs: readonly InspectorTabInfo[];
  current: InspectorTab;
  onSelect: (tab: InspectorTab) => void;
}

/**
 * The inspector's tabs, the one shown underlined, with their counts, and
 * the failure's named in the error colour. The underline moves across to
 * the tab chosen.
 *
 * @param props - The tabs, the one shown, and what shows another
 * @returns The bar
 * @example
 * ```tsx
 * <TabBar tabs={inspectorTabsOf(request)} current={tab} onSelect={show} />
 * ```
 */
export function TabBar({ tabs, current, onSelect }: TabBarProps): React.ReactNode {
  return (
    /* The strip reaches one pixel into the header's rule below it, so the chosen tab's mark lies on the rule inside the strip, which would scroll by that pixel otherwise. */
    <motion.div
      layoutScroll
      role="tablist"
      aria-label="Request"
      className="-mx-1.5 -mb-px flex overflow-x-auto overflow-y-hidden pb-px [scrollbar-width:none]"
    >
      {tabs.map((tab) => {
        const on = tab.key === current;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "relative flex h-9.5 shrink-0 cursor-pointer items-center gap-1.5 px-1.5 text-control whitespace-nowrap transition-colors hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              on ? "font-semibold" : "font-medium",
              tab.alert ? "text-err" : on ? "text-fg" : "text-fg-subtle",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="inline-flex h-4 min-w-4.5 items-center justify-center rounded-full bg-raised px-1.25 text-meta font-medium text-fg-subtle tabular-nums">
                {tab.count}
              </span>
            )}
            {on && (
              <motion.span
                layoutId="request-inspector-tab"
                transition={INDICATOR_SPRING}
                aria-hidden="true"
                className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-t-[2px] bg-brand"
              />
            )}
          </button>
        );
      })}
    </motion.div>
  );
}
