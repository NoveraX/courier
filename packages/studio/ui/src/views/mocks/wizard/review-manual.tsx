import { Copy } from "lucide-react";

import type { ManualOutcome } from "./wire-types";

import { CodeBlock } from "@/components/shared/code-block";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

/** The mocks file a manual outcome names, or the one its snippet would create. */
const DEFAULT_TARGET = "courier.mocks.ts";

/**
 * The mocks to add by hand: why Studio leaves the edit to the user, the
 * snippet, and a button that copies it. When asking again may succeed —
 * Studio was still loading or busy, a file did not load, or the mocks file
 * changed since it loaded — the footer offers to check again, and a change
 * to the project asks again by itself.
 *
 * @param props.outcome - Studio's manual outcome
 * @returns The explanation and the snippet
 *
 * @example
 * ```tsx
 * <ReviewManual outcome={plan.outcome} />
 * ```
 */
export function ReviewManual({ outcome }: { outcome: ManualOutcome }): React.ReactElement {
  const target = outcome.target ?? DEFAULT_TARGET;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-h3">{outcome.creates ? `Create ${target} yourself` : `Add this to ${target} yourself`}</h3>
        <ul className="space-y-1">
          {outcome.reasons.map((reason) => (
            <li key={`${reason.code}:${reason.message}`} className="text-body-sm text-muted-foreground">
              {reason.message} <span className="mono-xs text-muted-foreground/60">{reason.code}</span>
            </li>
          ))}
        </ul>
      </div>
      <CodeBlock code={outcome.snippet} language="ts" />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => void copyToClipboard(outcome.snippet, "snippet")}
        >
          <Copy className="size-3" />
          Copy snippet
        </Button>
        <p className="text-body-xs text-muted-foreground/60">
          {outcome.retryable
            ? "Studio plans the change again by itself when the project changes, or on Check again."
            : "Studio picks the mocks up when you save the file."}
        </p>
      </div>
    </div>
  );
}
