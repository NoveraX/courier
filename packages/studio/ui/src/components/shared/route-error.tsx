import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * What a view shows when it throws while it renders or loads: the error,
 * and a way to render the view again. Without it the whole page went blank
 * and said nothing.
 *
 * @param props - The error and the router's reset
 * @returns The error state
 * @example
 * ```tsx
 * createRouter({ routeTree, defaultErrorComponent: RouteError });
 * ```
 */
export function RouteError({ error, reset }: ErrorComponentProps): React.ReactElement {
  useEffect(() => {
    console.error("A Studio view failed", error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      heading="This view failed"
      description={error instanceof Error ? error.message : String(error)}
      action={{ label: "Try again", onClick: reset }}
    />
  );
}
