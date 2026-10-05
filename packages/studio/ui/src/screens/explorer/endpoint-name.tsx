import type { EndpointRef } from "@/features/explorer/endpoint-key";
import { keyParts } from "@/features/explorer/endpoint-key";

/**
 * An endpoint's dotted name with its source dim: `api.` `orders.create`.
 *
 * @param props - The endpoint
 * @returns The name
 * @example
 * ```tsx
 * <EndpointName source="api" group="orders" method="create" />
 * ```
 */
export function EndpointName(props: EndpointRef): React.ReactNode {
  const { source, rest } = keyParts(props);
  return (
    <span className="truncate">
      <span className="text-fg-subtle">{source}.</span>
      {rest}
    </span>
  );
}
