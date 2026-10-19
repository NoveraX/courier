import { Server, Sparkles } from "lucide-react";

import { openMockWizard } from "@/mocks/wizard/open-mock-wizard";
import { useAddMockBlocked } from "@/mocks/wizard/use-add-mock-blocked";

/**
 * What every Mocks tab says while there is no mock server: what a mock
 * gives, or why none can be added now, and the way to generate the first
 * one — in the middle of the tab, which it fills.
 *
 * @returns The notice
 * @example
 * ```tsx
 * if (!server) return loading ? <MocksSkeleton view="list" /> : <NoMockServers />;
 * ```
 */
export function NoMockServers(): React.ReactNode {
  const blocked = useAddMockBlocked();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-dialog border border-line-strong bg-panel text-fg-subtle">
        <Server aria-hidden="true" className="size-4.5" />
      </span>
      <p className="text-title font-semibold">No mock servers yet</p>
      <p className="max-w-95 text-small text-fg-subtle">
        {blocked ??
          "Generate mocks for one of your API sources, and Studio serves realistic answers from its schemas."}
      </p>
      <button
        type="button"
        onClick={openMockWizard}
        disabled={blocked !== null}
        className="mt-2 flex h-8 cursor-pointer items-center gap-1.75 rounded-card bg-fg px-3 text-control font-semibold text-bg disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10"
      >
        <Sparkles aria-hidden="true" className="size-3.25" />
        Generate mocks
      </button>
    </div>
  );
}
