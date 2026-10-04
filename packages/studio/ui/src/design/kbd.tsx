import { cn } from "@/lib/utils";

/**
 * A key or chord as the keyboard shows it: `⌘K`, `esc`.
 *
 * @param props - The key, and classes to add
 * @returns The key
 * @example
 * ```tsx
 * <Kbd>⌘K</Kbd>
 * ```
 */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>): React.ReactNode {
  return (
    <kbd
      className={cn(
        "rounded-chip border border-line px-1.25 py-px font-mono text-meta text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}
