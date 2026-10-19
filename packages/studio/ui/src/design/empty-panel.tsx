import type { LucideIcon } from "lucide-react";

interface EmptyPanelProps {
  icon: LucideIcon;
  /** What the page has none of yet. */
  title: string;
  /** How it comes: the sentence under the title. */
  children: React.ReactNode;
}

/**
 * A report page's panel while there is nothing to report: the page's icon,
 * what is missing and how it comes. It takes the height the page leaves
 * under its header — the page grows to the view with `min-h-full` — and
 * keeps its words in the middle, so the page reads as waiting, not cut
 * short.
 *
 * @param props - The icon, the title and the sentence under it
 * @returns The panel
 * @example
 * ```tsx
 * <EmptyPanel icon={Shield} title="No requests to audit">
 *   Make a few calls from your app, then run the audit again.
 * </EmptyPanel>
 * ```
 */
export function EmptyPanel({ icon: Icon, title, children }: EmptyPanelProps): React.ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-dialog border border-line bg-panel px-6 py-16 text-center">
      <Icon aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="m-0 text-ui font-strong">{title}</p>
      <p className="m-0 max-w-100 text-small text-fg-subtle">{children}</p>
    </div>
  );
}
