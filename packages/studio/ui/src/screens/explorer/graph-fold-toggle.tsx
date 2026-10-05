import { Minus } from "lucide-react";

import type { GraphNode } from "@/features/explorer/graph-types";
import { cn } from "@/lib/utils";

/**
 * The control that folds a group on the Explorer's graph, at its card's
 * right edge: a minus while the group shows what is inside it, a count of
 * the endpoints it hides once folded. It is a button of its own beside the
 * card, which opens the group's endpoints.
 *
 * @param props - The group's node, and what folding it does
 * @returns The control, or nothing for a node that holds nothing to fold
 * @example
 * ```tsx
 * <GraphFoldToggle node={node} onFold={toggle} />
 * ```
 */
export function GraphFoldToggle({
  node,
  onFold,
}: {
  node: GraphNode;
  onFold: (key: string) => void;
}): React.ReactNode {
  const { fold } = node;
  if (!fold) return null;
  const label = fold.folded
    ? `Unfold ${node.key}: ${fold.hidden} endpoints inside`
    : `Fold ${node.key}`;
  return (
    <button
      type="button"
      onClick={() => onFold(node.key)}
      aria-label={label}
      aria-expanded={!fold.folded}
      title={label}
      className={cn(
        "absolute top-1/2 -right-2.5 flex h-5 min-w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-panel px-1 font-mono text-badge text-fg-muted shadow-node transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand",
        fold.folded && "border-brand/45 text-brand",
        node.dim && "opacity-30",
      )}
    >
      {fold.folded ? `+${fold.hidden}` : <Minus aria-hidden="true" className="size-2.5" />}
    </button>
  );
}
