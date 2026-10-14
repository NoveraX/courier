import { isApplePlatform } from "@/lib/apple-platform";
import { keyLabels } from "@/lib/key-labels";
import { cn } from "@/lib/utils";
import { Kbd } from "./kbd";

interface ShortcutProps {
  /** The keys pressed together, as the handlers name them: `["mod", "shift", "L"]`. */
  keys: readonly string[];
  className?: string | undefined;
}

/**
 * A shortcut as the keys to press, each on a keycap of its own and
 * labelled as the keyboard in front of the user labels it: `⇧ ⌘ L` on a
 * Mac, `Ctrl Shift L` elsewhere. A screen reader reads the keys' names.
 *
 * @param props - The keys, and classes to add
 * @returns The shortcut
 * @example
 * ```tsx
 * <Shortcut keys={["mod", "K"]} />
 * ```
 */
export function Shortcut({ keys, className }: ShortcutProps): React.ReactNode {
  const labels = keyLabels(keys, isApplePlatform());
  return (
    /* Relative, so the names a screen reader hears stay inside it: absolutely placed, they would
       reach past a scrolling list to the dialog around it, and lengthen what that scrolls. */
    <kbd className={cn("relative inline-flex shrink-0 items-center gap-0.5 font-mono", className)}>
      <span className="sr-only">{labels.map((key) => key.spoken).join(" ")}</span>
      {labels.map((key) => (
        <Kbd key={key.label} aria-hidden="true">
          {key.label}
        </Kbd>
      ))}
    </kbd>
  );
}
