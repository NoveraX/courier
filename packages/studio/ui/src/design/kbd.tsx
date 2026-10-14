import { cn } from "@/lib/utils";

/**
 * A key as a keycap shows it: `⌘`, `esc`. A shortcut of several keys is a
 * `Shortcut`, which labels them as the user's keyboard does.
 *
 * @param props - The key, and classes to add
 * @returns The key
 * @example
 * ```tsx
 * <Kbd>esc</Kbd>
 * ```
 */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>): React.ReactNode {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-chip border border-line-strong bg-panel-subtle px-1 font-mono text-small leading-none text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
