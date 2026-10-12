import { CardSection } from "@/design/card-section";
import { methodText } from "@/design/method-color";
import { topRoutes } from "@/features/mocks/dashboard-model";
import { cn } from "@/lib/utils";
import type { MockRouteEntry } from "@/store/mock-slice";

/* A card too narrow for the four columns puts each route's share under its path, so the
   path keeps the room it needs. */
const ROW =
  "grid min-h-8.5 grid-cols-[44px_minmax(0,1fr)_minmax(50px,100px)_44px] items-center gap-2.5 px-2.5 font-mono text-small @max-[25rem]:grid-cols-[40px_minmax(0,1fr)_auto] @max-[25rem]:gap-x-2 @max-[25rem]:gap-y-1 @max-[25rem]:py-1.5";

/**
 * The mock's busiest routes by hits, each with a bar against the busiest —
 * under its path when the card is narrow.
 *
 * @param props - The server's routes
 * @returns The card
 * @example
 * ```tsx
 * <TopRoutes routes={server.routes} />
 * ```
 */
export function TopRoutes({ routes }: { routes: readonly MockRouteEntry[] }): React.ReactNode {
  const top = topRoutes(routes);
  return (
    <CardSection
      title="Top routes"
      aside={<span className="text-label text-fg-subtle">by hits</span>}
    >
      <div className="@container flex flex-col p-1.5">
        {top.length === 0 && (
          <p className="px-2.5 py-6 text-center text-control text-fg-subtle">No routes yet</p>
        )}
        {top.map(({ route, share }) => (
          <div key={`${route.httpMethod} ${route.fullPath}`} className={ROW}>
            <span
              className={cn(
                "text-micro font-semibold @max-[25rem]:row-start-1",
                methodText(route.httpMethod.toUpperCase()),
              )}
            >
              {route.httpMethod.toUpperCase()}
            </span>
            <span className="truncate @max-[25rem]:row-start-1">{route.fullPath}</span>
            <span className="h-1.25 overflow-hidden rounded-[3px] bg-raised @max-[25rem]:col-start-2 @max-[25rem]:row-start-2">
              <span
                className="block h-full rounded-[3px] bg-brand"
                style={{ width: `${share * 100}%` }}
              />
            </span>
            <span className="text-right text-fg-muted tabular-nums @max-[25rem]:col-start-3 @max-[25rem]:row-start-1">
              {route.hits}
            </span>
          </div>
        ))}
      </div>
    </CardSection>
  );
}
