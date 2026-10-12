import { Link } from "@tanstack/react-router";
import { ArrowLeft, SearchX } from "lucide-react";

/**
 * What Studio shows at an address it has no page for — an old link, a
 * mistyped path — with the way back to the Timeline.
 *
 * @returns The page
 * @example
 * ```tsx
 * createRootRoute({ notFoundComponent: NotFoundScreen });
 * ```
 */
export function NotFoundScreen(): React.ReactNode {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-10 text-center max-sm:p-6">
      <SearchX aria-hidden="true" className="size-6 text-fg-subtle" />
      <h1 className="m-0 text-heading font-semibold">No page here</h1>
      <p className="m-0 max-w-90 text-small text-fg-subtle">
        Studio has no page at this address. It may have moved, or the link is from an older version.
      </p>
      <Link
        to="/timeline"
        className="mt-1 flex h-7.5 items-center gap-1.75 rounded-card border border-line bg-panel px-3 text-control text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9"
      >
        <ArrowLeft aria-hidden="true" className="size-3.25" />
        Back to the Timeline
      </Link>
    </div>
  );
}
