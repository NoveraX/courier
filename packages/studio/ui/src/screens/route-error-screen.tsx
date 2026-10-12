import type { ErrorComponentProps } from "@tanstack/react-router";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

/**
 * What a view shows when it throws while it renders or loads: what went
 * wrong, and a way to render it again — the rest of the shell stays.
 *
 * @param props - The error and the router's reset
 * @returns The error state
 * @example
 * ```tsx
 * createRouter({ routeTree, defaultErrorComponent: RouteErrorScreen });
 * ```
 */
export function RouteErrorScreen({ error, reset }: ErrorComponentProps): React.ReactNode {
  useEffect(() => {
    console.error("A Studio view failed", error);
  }, [error]);
  return (
    <div
      role="alert"
      className="flex min-h-full flex-col items-center justify-center gap-3 p-10 text-center max-sm:p-6"
    >
      <TriangleAlert aria-hidden="true" className="size-6 text-err" />
      <h1 className="m-0 text-heading font-semibold">This view failed</h1>
      <p className="m-0 max-w-120 font-mono text-small break-words text-fg-subtle">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-1 flex h-7.5 cursor-pointer items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9"
      >
        <RotateCcw aria-hidden="true" className="size-3.25" />
        Try again
      </button>
    </div>
  );
}
